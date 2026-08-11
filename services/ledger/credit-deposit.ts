import { prisma } from '../../src/lib/prisma';
import { creditDepositInputSchema, type CreditDepositInput } from './schema';

export type CreditDepositResult =
  | { status: 'credited'; entryId: string }
  | { status: 'already-credited'; entryId: string };

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * The ONLY entry point for crediting a confirmed on-chain deposit to a
 * user's table balance (architecture.md invariant 1).
 *
 * Callers must have already independently confirmed the deposit
 * on-chain, or hold the facilitator's signed settlement receipt —
 * never call this on a client-reported "payment succeeded"
 * (code-standards.md, Money/RNG & Compliance).
 *
 * Idempotent via the DB-level unique constraint on `txHash`: a retried
 * call with the same tx hash returns the existing entry instead of
 * double-crediting (architecture.md invariant 6).
 */
export async function creditDeposit(
  input: CreditDepositInput
): Promise<CreditDepositResult> {
  const parsed = creditDepositInputSchema.parse(input);

  try {
    const entry = await prisma.ledgerEntry.create({
      data: {
        userId: parsed.userId,
        type: 'DEPOSIT',
        amountMicroUsd: parsed.amountMicroUsd,
        asset: parsed.asset,
        chainId: parsed.chainId,
        txHash: parsed.txHash,
      },
    });
    return { status: 'credited', entryId: entry.id };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const existing = await prisma.ledgerEntry.findUniqueOrThrow({
        where: { txHash: parsed.txHash },
      });
      return { status: 'already-credited', entryId: existing.id };
    }
    throw err;
  }
}
