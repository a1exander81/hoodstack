import { prisma } from '../../src/lib/prisma';
import {
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
} from './commit-reveal';
import { clientSeedSchema, userIdSchema } from './schema';

/**
 * What a player may see about their ACTIVE pair. Deliberately has no
 * serverSeed field: revealing it before rotation would let a player
 * compute every future outcome under this pair before betting.
 */
export type SeedCommitment = {
  seedPairId: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
};

export type RevealedPair = {
  seedPairId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  finalNonce: number;
};

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

function toCommitment(pair: {
  id: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}): SeedCommitment {
  return {
    seedPairId: pair.id,
    serverSeedHash: pair.serverSeedHash,
    clientSeed: pair.clientSeed,
    nonce: pair.nonce,
  };
}

/**
 * Returns the user's active commitment, creating a pair on first use.
 *
 * Concurrency: two simultaneous first-bets race to create. The partial
 * unique index (one active pair per user, WHERE revealedAt IS NULL)
 * makes the loser fail with P2002 rather than producing two active
 * pairs -- caught here and resolved by re-reading, the same shape as
 * services/ledger's txHash idempotency.
 */
export async function getActiveCommitment(userId: string): Promise<SeedCommitment> {
  const parsedUserId = userIdSchema.parse(userId);

  const existing = await prisma.seedPair.findFirst({
    where: { userId: parsedUserId, revealedAt: null },
  });
  if (existing) return toCommitment(existing);

  const serverSeed = generateServerSeed();
  try {
    const created = await prisma.seedPair.create({
      data: {
        userId: parsedUserId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed: generateClientSeed(),
      },
    });
    return toCommitment(created);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const winner = await prisma.seedPair.findFirstOrThrow({
        where: { userId: parsedUserId, revealedAt: null },
      });
      return toCommitment(winner);
    }
    throw err;
  }
}

/**
 * Sets the player's client seed on their ACTIVE pair.
 *
 * Only legal while the pair is active and unused (nonce 0). Changing a
 * client seed mid-pair would retroactively change the derivation of
 * rounds already settled under it, making past outcomes unverifiable.
 * A player who wants a new client seed rotates instead.
 */
export async function setClientSeed(userId: string, clientSeed: string): Promise<SeedCommitment> {
  const parsedUserId = userIdSchema.parse(userId);
  const parsedSeed = clientSeedSchema.parse(clientSeed);

  const updated = await prisma.seedPair.updateMany({
    where: { userId: parsedUserId, revealedAt: null, nonce: 0 },
    data: { clientSeed: parsedSeed },
  });

  if (updated.count === 0) {
    throw new Error(
      'cannot set client seed: no active unused pair (rotate to change it after betting)',
    );
  }

  return getActiveCommitment(parsedUserId);
}

/**
 * Reveals the active pair and opens a fresh one, atomically.
 *
 * Both halves run in one transaction so there is never a moment with
 * zero active pairs (a bet would fail) or two (nonce ordering stops
 * having one answer). Returns the revealed seed so the player can now
 * verify every round settled under it.
 */
export async function rotateSeedPair(
  userId: string,
  nextClientSeed?: string,
): Promise<{ revealed: RevealedPair; next: SeedCommitment }> {
  const parsedUserId = userIdSchema.parse(userId);
  const parsedNext = nextClientSeed ? clientSeedSchema.parse(nextClientSeed) : undefined;

  return prisma.$transaction(async (tx) => {
    const current = await tx.seedPair.findFirstOrThrow({
      where: { userId: parsedUserId, revealedAt: null },
    });

    const revealed = await tx.seedPair.update({
      where: { id: current.id },
      data: { revealedAt: new Date() },
    });

    const serverSeed = generateServerSeed();
    const next = await tx.seedPair.create({
      data: {
        userId: parsedUserId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed: parsedNext ?? generateClientSeed(),
      },
    });

    return {
      revealed: {
        seedPairId: revealed.id,
        serverSeed: revealed.serverSeed,
        serverSeedHash: revealed.serverSeedHash,
        clientSeed: revealed.clientSeed,
        finalNonce: revealed.nonce,
      },
      next: toCommitment(next),
    };
  });
}
