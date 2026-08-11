import { prisma } from '../../src/lib/prisma';

/** Table balance is always a derived sum — never a stored, mutable column. */
export async function getTableBalanceMicroUsd(userId: string): Promise<bigint> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amountMicroUsd: true },
  });
  return result._sum.amountMicroUsd ?? BigInt(0);
}
