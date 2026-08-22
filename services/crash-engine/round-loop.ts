import { prisma } from '../../src/lib/prisma';
import { createCrashRoundCommitment } from '../rng';
import { deriveCrashPoint, elapsedMsForMultiplierBps, multiplierBpsAtElapsedMs } from '../games';
import { settleCrashBet } from '../ledger';

const DEFAULT_BETTING_WINDOW_MS = 5_000;
const DEFAULT_TICK_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs an optional observer callback without letting it affect the
 * round's own control flow. These callbacks exist to broadcast state
 * to something outside this module (Milestone 3b's socket layer) --
 * a broadcast failure (a dropped connection, a full outgoing buffer)
 * must never abort a round that still has real money riding on it.
 * Logged loudly rather than swallowed silently, same posture
 * settleCrashBet already takes toward its own silent-failure surface.
 */
function safeCallback(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`[runCrashRound] ${label} callback threw; continuing the round lifecycle:`, err);
  }
}

export class RoundTransitionError extends Error {
  constructor(
    readonly crashRoundId: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`crash round ${crashRoundId} could not transition ${from} -> ${to} (lost the CAS)`);
    this.name = 'RoundTransitionError';
  }
}

/**
 * Handed to onRunning once the round is live. This is the ONLY place
 * crashMultiplierBps is readable before the round crashes -- it lives
 * in this function's closure, never in a return value or a broadcast
 * payload, until the CRASHED transition below writes it to CrashRound.
 * Milestone 3b's socket layer uses this handle to process a live
 * cash-out: read crashMultiplierBps, compute the multiplier the
 * player's cash-out corresponds to from getElapsedMs(), and call
 * settleCrashBet directly -- the same authority this loop itself calls
 * for the end-of-round sweep below, so a live cash-out and a swept
 * loss are decided by the same function, never two.
 */
export type RunningRoundHandle = {
  crashRoundId: string;
  crashMultiplierBps: number;
  getElapsedMs(): number;
};

export type CrashRoundSummary = {
  crashRoundId: string;
  crashMultiplierBps: number;
  sweptBetCount: number;
  /** false means some PLACED bets could not be settled -- see finalizeCrashRound. */
  fullyResolved: boolean;
};

export type RunCrashRoundOptions = {
  bettingWindowMs?: number;
  tickIntervalMs?: number;
  onBettingOpen?: (info: { crashRoundId: string; serverSeedHash: string }) => void;
  onRunning?: (handle: RunningRoundHandle) => void;
  onTick?: (info: { crashRoundId: string; multiplierBps: number; elapsedMs: number }) => void;
  onCrashed?: (info: { crashRoundId: string; crashMultiplierBps: number }) => void;
};

export type FinalizeCrashRoundResult = {
  crashRoundId: string;
  sweptBetCount: number;
  /** false means at least one bet failed to settle and remains PLACED. */
  fullyResolved: boolean;
};

/**
 * Settles every still-PLACED bet against an already-CRASHED round as a
 * loss (via the same settleCrashBet a live cash-out uses), and marks
 * the round revealed ONLY once none remain PLACED.
 *
 * Idempotent and resumable by design, not just by accident: each bet
 * is settled independently, so one bet's failure does not block the
 * others, and revealedAt is withheld whenever any bet is still
 * unresolved -- a later call with the same arguments picks up exactly
 * where a prior, partially-failed call left off, rather than needing
 * its own separate recovery path. runCrashRound below is this
 * function's only caller today; Milestone 3b's server-startup recovery
 * (finding an already-CRASHED round that never reached revealedAt, and
 * re-running this against it) is expected to call it directly too,
 * which is why crashMultiplierBps is a required parameter rather than
 * read from CrashRound -- a round observed by that recovery path has
 * already had it written there, but this function does not assume
 * that is the only path that calls it.
 */
export async function finalizeCrashRound(
  crashRoundId: string,
  crashMultiplierBps: number,
): Promise<FinalizeCrashRoundResult> {
  const stillPlaced = await prisma.crashBet.findMany({
    where: { crashRoundId, status: 'PLACED' },
    select: { userId: true },
  });

  let sweptBetCount = 0;
  for (const { userId } of stillPlaced) {
    try {
      await settleCrashBet({
        userId,
        crashRoundId,
        crashMultiplierBps,
        cashoutMultiplierBps: null,
      });
      sweptBetCount++;
    } catch (err) {
      // Deliberately no userId in this log line -- see the same call
      // documented in services/ledger/settle-crash-bet.ts.
      console.error(
        `[finalizeCrashRound] failed to settle a bet in round ${crashRoundId}; it remains PLACED and a later finalize call will retry it:`,
        err,
      );
    }
  }

  const remaining = await prisma.crashBet.count({ where: { crashRoundId, status: 'PLACED' } });
  const fullyResolved = remaining === 0;

  if (fullyResolved) {
    await prisma.crashRound.update({
      where: { id: crashRoundId },
      data: { revealedAt: new Date() },
    });
  } else {
    console.error(
      `[finalizeCrashRound] round ${crashRoundId} still has ${remaining} unresolved bet(s) after this pass; revealedAt withheld`,
    );
  }

  return { crashRoundId, sweptBetCount, fullyResolved };
}

/**
 * Runs exactly one Crash round to completion: opens a commitment, holds
 * betting open for bettingWindowMs, transitions to RUNNING, ticks the
 * multiplier until it reaches the round's own (privately held) crash
 * point, transitions to CRASHED, then finalizes it via
 * finalizeCrashRound above.
 *
 * This function runs ONE round and returns -- scheduling many rounds
 * back to back (Milestone 3b's socket server) is a separate, thin loop
 * around a call to this function, not something this function does
 * itself.
 *
 * Both status transitions are guarded compare-and-swaps
 * (updateMany(...).count, not a bare update): this is what makes a bet
 * landing after betting closes, or this loop's own crash transition
 * racing something else, fail loudly instead of silently corrupting
 * round state. In normal operation nothing else ever transitions a
 * round this loop owns, so a RoundTransitionError here means a real
 * bug, not an expected race to swallow.
 */
export async function runCrashRound(
  options: RunCrashRoundOptions = {},
): Promise<CrashRoundSummary> {
  const bettingWindowMs = options.bettingWindowMs ?? DEFAULT_BETTING_WINDOW_MS;
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;

  const { crashRoundId, serverSeedHash, float } = await createCrashRoundCommitment();
  const crashMultiplierBps = deriveCrashPoint(float);

  if (options.onBettingOpen) {
    safeCallback('onBettingOpen', () => options.onBettingOpen!({ crashRoundId, serverSeedHash }));
  }
  await sleep(bettingWindowMs);

  const toRunning = await prisma.crashRound.updateMany({
    where: { id: crashRoundId, status: 'BETTING' },
    data: { status: 'RUNNING', bettingClosedAt: new Date() },
  });
  if (toRunning.count === 0) {
    throw new RoundTransitionError(crashRoundId, 'BETTING', 'RUNNING');
  }

  const runningStartedAt = Date.now();
  const getElapsedMs = () => Date.now() - runningStartedAt;
  if (options.onRunning) {
    safeCallback('onRunning', () => options.onRunning!({ crashRoundId, crashMultiplierBps, getElapsedMs }));
  }

  const crashAtMs = elapsedMsForMultiplierBps(crashMultiplierBps);
  while (getElapsedMs() < crashAtMs) {
    await sleep(Math.min(tickIntervalMs, Math.max(0, crashAtMs - getElapsedMs())));
    const elapsedMs = getElapsedMs();
    if (options.onTick) {
      const multiplierBps = Math.min(multiplierBpsAtElapsedMs(elapsedMs), crashMultiplierBps);
      safeCallback('onTick', () => options.onTick!({ crashRoundId, multiplierBps, elapsedMs }));
    }
  }

  const toCrashed = await prisma.crashRound.updateMany({
    where: { id: crashRoundId, status: 'RUNNING' },
    data: { status: 'CRASHED', crashMultiplierBps, crashedAt: new Date() },
  });
  if (toCrashed.count === 0) {
    throw new RoundTransitionError(crashRoundId, 'RUNNING', 'CRASHED');
  }
  if (options.onCrashed) {
    safeCallback('onCrashed', () => options.onCrashed!({ crashRoundId, crashMultiplierBps }));
  }

  const { sweptBetCount, fullyResolved } = await finalizeCrashRound(crashRoundId, crashMultiplierBps);

  return { crashRoundId, crashMultiplierBps, sweptBetCount, fullyResolved };
}
