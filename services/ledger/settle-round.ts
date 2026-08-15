import { prisma } from '../../src/lib/prisma';
import { resolveCoinflip, type CoinSide } from '../games';
import { settleRoundInputSchema, type SettleRoundInput } from './round-schema';

export class InsufficientBalanceError extends Error {
  constructor(
    readonly balanceMicroUsd: bigint,
    readonly wagerMicroUsd: bigint,
  ) {
    super(
      `insufficient table balance: have ${balanceMicroUsd}, need ${wagerMicroUsd}`,
    );
    this.name = 'InsufficientBalanceError';
  }
}

export type SettleRoundResult = {
  status: 'settled' | 'already-settled';
  gameRoundId: string;
  outcome: Record<string, unknown>;
  payoutMicroUsd: bigint;
  balanceMicroUsd: bigint;
};

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * The ONLY entry point that mutates a table balance for gameplay
 * (architecture.md invariant 1). Deposits go through creditDeposit();
 * everything else must go through here.
 *
 * Writes TWO ledger rows on a win -- a negative WAGER and a positive
 * PAYOUT -- rather than one net row. The net sum is identical, but an
 * append-only ledger should show what was staked separately from what was
 * returned; a single net row destroys that and cannot be audited.
 *
 * CONCURRENCY (invariant 4, "no negative balances"): the balance check
 * cannot be a plain read-then-insert. aggregate() takes no locks, so two
 * simultaneous bets both read the same balance and both pass. A
 * transaction-scoped advisory lock keyed on the user serializes them; it
 * releases automatically at commit or rollback, and different users do not
 * contend. Same failure this project already avoided in reserveRound()'s
 * atomic nonce increment.
 *
 * IDEMPOTENCY (invariant 6): keyed on GameRound's existing
 * @@unique([seedPairId, nonce]). A replayed round violates that constraint
 * and rolls the whole transaction back -- both ledger rows included --
 * rather than paying twice. Deliberately not a separate idempotency column:
 * reserveRound() already claims each nonce atomically, so the pair is
 * unique by construction.
 *
 * The payout is computed HERE from the round's float via services/games,
 * never taken from the caller. `expectedPayoutMicroUsd`, if supplied, is
 * checked against it and throws on mismatch -- that catches a UI showing a
 * player one number while the ledger records another.
 */
export async function settleInstantRound(
  input: SettleRoundInput,
): Promise<SettleRoundResult> {
  const parsed = settleRoundInputSchema.parse(input);

  if (parsed.game !== 'COINFLIP') {
    throw new Error(
      `no resolver wired for ${parsed.game}; only COINFLIP settles instantly today`,
    );
  }

  const resolution = resolveCoinflip(
    parsed.float,
    parsed.side as CoinSide,
    parsed.wagerMicroUsd,
  );

  if (
    parsed.expectedPayoutMicroUsd !== undefined &&
    parsed.expectedPayoutMicroUsd !== resolution.payoutMicroUsd
  ) {
    throw new Error(
      `payout mismatch: caller expected ${parsed.expectedPayoutMicroUsd}, ` +
        `ledger derived ${resolution.payoutMicroUsd}`,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${parsed.userId}))`;

      const before = await tx.ledgerEntry.aggregate({
        where: { userId: parsed.userId },
        _sum: { amountMicroUsd: true },
      });
      const balanceMicroUsd = before._sum.amountMicroUsd ?? 0n;

      if (balanceMicroUsd < parsed.wagerMicroUsd) {
        throw new InsufficientBalanceError(balanceMicroUsd, parsed.wagerMicroUsd);
      }

      const round = await tx.gameRound.create({
        data: {
          userId: parsed.userId,
          seedPairId: parsed.seedPairId,
          nonce: parsed.nonce,
          game: parsed.game,
          outcome: resolution.outcome as object,
          wagerMicroUsd: parsed.wagerMicroUsd,
          payoutMicroUsd: resolution.payoutMicroUsd,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: parsed.userId,
          type: 'WAGER',
          amountMicroUsd: -parsed.wagerMicroUsd,
          gameRoundId: round.id,
        },
      });

      if (resolution.payoutMicroUsd > 0n) {
        await tx.ledgerEntry.create({
          data: {
            userId: parsed.userId,
            type: 'PAYOUT',
            amountMicroUsd: resolution.payoutMicroUsd,
            gameRoundId: round.id,
          },
        });
      }

      return {
        status: 'settled' as const,
        gameRoundId: round.id,
        outcome: resolution.outcome,
        payoutMicroUsd: resolution.payoutMicroUsd,
        balanceMicroUsd:
          balanceMicroUsd - parsed.wagerMicroUsd + resolution.payoutMicroUsd,
      };
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;

    // This exact (seedPairId, nonce) already settled -- a retry, not a new
    // round. Return what was recorded then; do not re-derive or re-pay.
    const existing = await prisma.gameRound.findUniqueOrThrow({
      where: {
        seedPairId_nonce: { seedPairId: parsed.seedPairId, nonce: parsed.nonce },
      },
    });
    const after = await prisma.ledgerEntry.aggregate({
      where: { userId: parsed.userId },
      _sum: { amountMicroUsd: true },
    });

    return {
      status: 'already-settled',
      gameRoundId: existing.id,
      outcome: existing.outcome as Record<string, unknown>,
      payoutMicroUsd: existing.payoutMicroUsd,
      balanceMicroUsd: after._sum.amountMicroUsd ?? 0n,
    };
  }
}
