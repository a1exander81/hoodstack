import { prisma } from '../../src/lib/prisma';
import { createCrashRoundCommitment } from '../rng';
import { deriveCrashPoint, elapsedMsForMultiplierBps, multiplierBpsAtElapsedMs } from '../games';
import { settleCrashBet } from '../ledger';

const DEFAULT_BETTING_WINDOW_MS = 5_000;
const DEFAULT_TICK_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
};

export type RunCrashRoundOptions = {
  bettingWindowMs?: number;
  tickIntervalMs?: number;
  onBettingOpen?: (info: { crashRoundId: string; serverSeedHash: string }) => void;
  onRunning?: (handle: RunningRoundHandle) => void;
  onTick?: (info: { crashRoundId: string; multiplierBps: number; elapsedMs: number }) => void;
  onCrashed?: (info: { crashRoundId: string; crashMultiplierBps: number }) => void;
};

/**
 * Runs exactly one Crash round to completion: opens a commitment, holds
 * betting open for bettingWindowMs, transitions to RUNNING, ticks the
 * multiplier until it reaches the round's own (privately held) crash
 * point, transitions to CRASHED, sweeps every bet still PLACED against
 * this round as a loss via the same settleCrashBet a live cash-out
 * uses, and marks the round revealed.
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

  options.onBettingOpen?.({ crashRoundId, serverSeedHash });
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
  options.onRunning?.({ crashRoundId, crashMultiplierBps, getElapsedMs });

  const crashAtMs = elapsedMsForMultiplierBps(crashMultiplierBps);
  while (getElapsedMs() < crashAtMs) {
    await sleep(Math.min(tickIntervalMs, Math.max(0, crashAtMs - getElapsedMs())));
    const elapsedMs = getElapsedMs();
    options.onTick?.({
      crashRoundId,
      multiplierBps: Math.min(multiplierBpsAtElapsedMs(elapsedMs), crashMultiplierBps),
      elapsedMs,
    });
  }

  const toCrashed = await prisma.crashRound.updateMany({
    where: { id: crashRoundId, status: 'RUNNING' },
    data: { status: 'CRASHED', crashMultiplierBps, crashedAt: new Date() },
  });
  if (toCrashed.count === 0) {
    throw new RoundTransitionError(crashRoundId, 'RUNNING', 'CRASHED');
  }
  options.onCrashed?.({ crashRoundId, crashMultiplierBps });

  const stillPlaced = await prisma.crashBet.findMany({
    where: { crashRoundId, status: 'PLACED' },
    select: { userId: true },
  });

  for (const { userId } of stillPlaced) {
    await settleCrashBet({
      userId,
      crashRoundId,
      crashMultiplierBps,
      cashoutMultiplierBps: null,
    });
  }

  await prisma.crashRound.update({
    where: { id: crashRoundId },
    data: { revealedAt: new Date() },
  });

  return { crashRoundId, crashMultiplierBps, sweptBetCount: stillPlaced.length };
}
