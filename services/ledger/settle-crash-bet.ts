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

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
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
 * GameRound/settleInstantRound's nonce-based idempotency.
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
    if (!isUniqueConstraintError(err)) throw err;

    const existing = await prisma.crashBet.findUniqueOrThrow({
      where: {
        crashRoundId_userId: { crashRoundId: parsed.crashRoundId, userId: parsed.userId },
      },
    });
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
      console.error('[settleCrashBet] rejected cashout at/past crash point:', {
        crashBetId: bet.id,
        userId: parsed.userId,
        crashRoundId: parsed.crashRoundId,
        crashMultiplierBps: parsed.crashMultiplierBps,
        cashoutMultiplierBps: parsed.cashoutMultiplierBps,
      });
    }

    await tx.crashBet.update({
      where: { id: bet.id },
      data: {
        status: won ? 'CASHED_OUT' : 'LOST',
        cashoutMultiplierBps: parsed.cashoutMultiplierBps,
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
