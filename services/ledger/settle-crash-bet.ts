import { prisma } from '../../src/lib/prisma';
import { resolveCrashBet } from '../games';
import { InsufficientBalanceError } from './settle-round';
import {
  placeCrashBetInputSchema,
  settleCrashBetInputSchema,
  type PlaceCrashBetInput,
  type SettleCrashBetInput,
} from './crash-schema';

export class RoundNotOpenForBettingError extends Error {
  constructor(
    readonly crashRoundId: string,
    readonly status: string,
  ) {
    super(`crash round ${crashRoundId} is not open for betting (status: ${status})`);
    this.name = 'RoundNotOpenForBettingError';
  }
}

/**
 * Narrowly matches the specific CrashBet unique-constraint violation --
 * not just any P2002. This function's caller only rescues the specific
 * duplicate-bet case and rethrows everything else, rather than treating
 * every P2002 in the transaction as if it meant the same thing.
 *
 * Matched on `meta.modelName === 'CrashBet'`, NOT `meta.target` field
 * names -- checked directly against a real duplicate insert under this
 * project's actual Prisma 7.9.1 + @prisma/adapter-pg combination:
 * `meta` here is `{ modelName: 'CrashBet', driverAdapterError: ... }`,
 * with no `target` array at all. `CrashBet` has exactly one unique
 * constraint (`@@unique([crashRoundId, userId])`), so `modelName` alone
 * is unambiguous for this model; do not port a `meta.target`-based
 * check from documentation or from another Prisma/driver combination
 * without re-confirming against a real error object first.
 */
function isCrashBetDuplicateError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002' &&
    (err as { meta?: { modelName?: unknown } }).meta?.modelName === 'CrashBet'
  );
}

export class DuplicateBetWagerMismatchError extends Error {
  constructor(
    readonly existingWagerMicroUsd: bigint,
    readonly requestedWagerMicroUsd: bigint,
  ) {
    super(
      `a bet already exists for this round at a different wager (existing: ${existingWagerMicroUsd}, requested: ${requestedWagerMicroUsd})`,
    );
    this.name = 'DuplicateBetWagerMismatchError';
  }
}

export type PlaceCrashBetResult = {
  status: 'placed' | 'already-placed';
  crashBetId: string;
  balanceMicroUsd: bigint;
};

/**
 * Debits a wager into a new CrashBet against an already-open round. The
 * OTHER half of Crash's two-phase settlement -- see settleCrashBet below
 * for where the payout (if any) is credited, in a separate, later call.
 *
 * Row-locks the CrashRound (`FOR UPDATE`) before checking its status is
 * BETTING, so this can never race the round engine's own
 * BETTING -> RUNNING transition: whichever transaction commits first is
 * authoritative, and the loser either sees the bet accepted or sees
 * betting already closed -- never a bet silently placed after the
 * window shut.
 *
 * Idempotent via CrashBet's existing `@@unique([crashRoundId, userId])`
 * -- a retried call for a bet already placed returns the existing bet
 * rather than a second WAGER row, the same shape as
 * GameRound/settleInstantRound's nonce-based idempotency. A retry at a
 * DIFFERENT wager amount is not treated as the same idempotent retry --
 * see DuplicateBetWagerMismatchError below -- since silently reporting
 * success for a different amount than what was actually recorded would
 * hide a real caller bug behind a happy-looking response.
 */
export async function placeCrashBet(input: PlaceCrashBetInput): Promise<PlaceCrashBetResult> {
  const parsed = placeCrashBetInputSchema.parse(input);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${parsed.userId}))`;

      const rounds = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM "CrashRound" WHERE id = ${parsed.crashRoundId} FOR UPDATE
      `;
      const round = rounds[0];
      if (!round) {
        throw new Error(`crash round ${parsed.crashRoundId} does not exist`);
      }
      if (round.status !== 'BETTING') {
        throw new RoundNotOpenForBettingError(parsed.crashRoundId, round.status);
      }

      const before = await tx.ledgerEntry.aggregate({
        where: { userId: parsed.userId },
        _sum: { amountMicroUsd: true },
      });
      const balanceMicroUsd = before._sum.amountMicroUsd ?? 0n;

      if (balanceMicroUsd < parsed.wagerMicroUsd) {
        throw new InsufficientBalanceError(balanceMicroUsd, parsed.wagerMicroUsd);
      }

      const bet = await tx.crashBet.create({
        data: {
          userId: parsed.userId,
          crashRoundId: parsed.crashRoundId,
          wagerMicroUsd: parsed.wagerMicroUsd,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: parsed.userId,
          type: 'WAGER',
          amountMicroUsd: -parsed.wagerMicroUsd,
          crashBetId: bet.id,
        },
      });

      return {
        status: 'placed' as const,
        crashBetId: bet.id,
        balanceMicroUsd: balanceMicroUsd - parsed.wagerMicroUsd,
      };
    });
  } catch (err) {
    if (!isCrashBetDuplicateError(err)) throw err;

    const existing = await prisma.crashBet.findUniqueOrThrow({
      where: {
        crashRoundId_userId: { crashRoundId: parsed.crashRoundId, userId: parsed.userId },
      },
    });

    if (existing.wagerMicroUsd !== parsed.wagerMicroUsd) {
      throw new DuplicateBetWagerMismatchError(existing.wagerMicroUsd, parsed.wagerMicroUsd);
    }

    const after = await prisma.ledgerEntry.aggregate({
      where: { userId: parsed.userId },
      _sum: { amountMicroUsd: true },
    });

    return {
      status: 'already-placed',
      crashBetId: existing.id,
      balanceMicroUsd: after._sum.amountMicroUsd ?? 0n,
    };
  }
}

export type SettleCrashBetResult = {
  status: 'settled' | 'already-settled';
  crashBetId: string;
  won: boolean;
  payoutMicroUsd: bigint;
  balanceMicroUsd: bigint;
};

/**
 * The ONLY entry point that resolves a CrashBet -- one function for
 * both halves of Crash's two-phase settlement, not two:
 *
 * - A player's live cash-out: called with the round engine's own
 *   privately-held crash point (not yet written to
 *   CrashRound.crashMultiplierBps, which only records the REVEALED,
 *   post-crash value -- see that column's schema comment) and a
 *   cashoutMultiplierBps the engine derived from real elapsed time,
 *   never trusted from the client directly.
 * - The round-end loss sweep: called once per still-PLACED bet after
 *   the round crashes, with cashoutMultiplierBps: null.
 *
 * Both funnel through the same resolveCrashBet authority
 * (services/games/crash.ts), so a cash-out is not simply trusted as a
 * win -- resolveCrashBet is what actually decides that, exactly as it
 * would for a third-party verifier re-deriving this round from the
 * seed CrashRound reveals once resolved.
 *
 * Row-locks the specific CrashBet (`FOR UPDATE`) before reading its
 * status, so a live cash-out and the loss sweep can never both act on
 * the same bet: whichever transaction commits first is authoritative,
 * and the second sees the already-updated status and returns the
 * existing result instead of double-processing. This is a per-bet
 * lock, not a per-round or per-user one -- concurrent settlement of
 * OTHER bets in the same round is never blocked by it.
 */
export async function settleCrashBet(input: SettleCrashBetInput): Promise<SettleCrashBetResult> {
  const parsed = settleCrashBetInputSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const bets = await tx.$queryRaw<
      Array<{ id: string; status: string; wagerMicroUsd: bigint; payoutMicroUsd: bigint | null }>
    >`
      SELECT id, status, "wagerMicroUsd", "payoutMicroUsd" FROM "CrashBet"
      WHERE "crashRoundId" = ${parsed.crashRoundId} AND "userId" = ${parsed.userId}
      FOR UPDATE
    `;
    const bet = bets[0];
    if (!bet) {
      throw new Error(
        `no crash bet for user ${parsed.userId} in round ${parsed.crashRoundId}`,
      );
    }

    if (bet.status !== 'PLACED') {
      // Already settled -- a retry, or the other side of the exact race
      // this function's row lock exists to close. Return what was
      // recorded; do not re-derive or re-pay.
      const after = await tx.ledgerEntry.aggregate({
        where: { userId: parsed.userId },
        _sum: { amountMicroUsd: true },
      });
      return {
        status: 'already-settled' as const,
        crashBetId: bet.id,
        won: bet.status === 'CASHED_OUT',
        payoutMicroUsd: bet.payoutMicroUsd ?? 0n,
        balanceMicroUsd: after._sum.amountMicroUsd ?? 0n,
      };
    }

    const resolution = resolveCrashBet(
      parsed.crashMultiplierBps,
      parsed.cashoutMultiplierBps,
      bet.wagerMicroUsd,
    );
    const won = resolution.payoutMicroUsd > 0n;

    if (parsed.cashoutMultiplierBps !== null && !won) {
      // The caller (the round engine) offered a cash-out that
      // resolveCrashBet rejected -- the multiplier was already at or
      // past the crash point. NOT the same event as a normal loss sweep
      // (cashoutMultiplierBps === null): it means the engine's own
      // live-multiplier tracking raced or drifted past the crash point
      // before marking the round CRASHED. Logged loudly so a real
      // engine defect that silently denies a legitimate win is visible
      // in the data, not indistinguishable from an ordinary loss --
      // same posture reconcile-deposit.ts takes toward its own
      // silent-failure surface.
      // crashBetId/crashRoundId are enough to identify the event and
      // look up the DID from the database if needed -- the raw
      // identifier doesn't need to sit in an error log at rest.
      console.error('[settleCrashBet] rejected cashout at/past crash point:', {
        crashBetId: bet.id,
        crashRoundId: parsed.crashRoundId,
        crashMultiplierBps: parsed.crashMultiplierBps,
        cashoutMultiplierBps: parsed.cashoutMultiplierBps,
      });
    }

    await tx.crashBet.update({
      where: { id: bet.id },
      data: {
        status: won ? 'CASHED_OUT' : 'LOST',
        // Only a genuine win records a cashout multiplier. A rejected
        // claim (won === false with a non-null cashoutMultiplierBps,
        // logged above) must not persist that value against a LOST
        // bet -- doing so would make a defensively-rejected claim
        // indistinguishable from a real recorded cashout attempt.
        cashoutMultiplierBps: won ? parsed.cashoutMultiplierBps : null,
        payoutMicroUsd: resolution.payoutMicroUsd,
        resolvedAt: new Date(),
      },
    });

    if (resolution.payoutMicroUsd > 0n) {
      await tx.ledgerEntry.create({
        data: {
          userId: parsed.userId,
          type: 'PAYOUT',
          amountMicroUsd: resolution.payoutMicroUsd,
          crashBetId: bet.id,
        },
      });
    }

    const after = await tx.ledgerEntry.aggregate({
      where: { userId: parsed.userId },
      _sum: { amountMicroUsd: true },
    });

    return {
      status: 'settled' as const,
      crashBetId: bet.id,
      won,
      payoutMicroUsd: resolution.payoutMicroUsd,
      balanceMicroUsd: after._sum.amountMicroUsd ?? 0n,
    };
  });
}
