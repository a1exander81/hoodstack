import { prisma } from '../../src/lib/prisma';
import { deriveFloat } from './commit-reveal';
import { getActiveCommitment } from './seed-pair';
import { userIdSchema } from './schema';

export type ReservedRound = {
  seedPairId: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
  /** Uniform in [0, 1). The caller maps this to a game outcome. */
  float: number;
};

/**
 * Claims the next nonce and derives that round's outcome.
 *
 * The nonce increment is a single atomic UPDATE ... RETURNING rather
 * than a read-then-write. Two concurrent bets from one user would
 * otherwise both read nonce N and both derive round N+1 -- identical
 * outcomes from one seed pair, which breaks verification outright.
 * Same reasoning as services/ledger enforcing idempotency with a DB
 * constraint instead of an app-level check-then-insert.
 *
 * Deliberately NOT computed as COUNT(rounds) + 1: that reuses a nonce
 * whenever a round fails between reservation and insert, and it looks
 * correct in every test where no round ever fails. A GAP in the nonce
 * sequence is harmless -- the skipped nonce is still derivable from
 * the revealed seed, so a player can confirm nothing was hidden. A
 * REUSED nonce is not recoverable.
 *
 * The `revealedAt IS NULL` guard in the WHERE clause means a pair
 * rotated concurrently rejects the reservation instead of appending a
 * round to an already-revealed pair.
 *
 * The server seed is read inside this module and never returned. The
 * caller receives a float, not the material to derive future rounds.
 */
export async function reserveRound(userId: string): Promise<ReservedRound> {
  const parsedUserId = userIdSchema.parse(userId);
  const commitment = await getActiveCommitment(parsedUserId);

  const rows = await prisma.$queryRaw<Array<{ nonce: number; serverSeed: string; clientSeed: string }>>`
    UPDATE "SeedPair"
    SET "nonce" = "nonce" + 1
    WHERE "id" = ${commitment.seedPairId} AND "revealedAt" IS NULL
    RETURNING "nonce", "serverSeed", "clientSeed"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error(
      `seed pair ${commitment.seedPairId} was revealed before the nonce could be reserved`,
    );
  }

  return {
    seedPairId: commitment.seedPairId,
    nonce: row.nonce,
    serverSeedHash: commitment.serverSeedHash,
    clientSeed: row.clientSeed,
    float: deriveFloat(row.serverSeed, row.clientSeed, row.nonce),
  };
}
