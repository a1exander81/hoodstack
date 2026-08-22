import { prisma } from '../../src/lib/prisma';
import { deriveFloat, generateServerSeed, hashServerSeed } from './commit-reveal';

/**
 * Crash's client seed is deliberately inert (architecture.md invariant
 * 2's Crash addendum: a shared outcome cannot be a function of any one
 * participant's private input), so there is nothing for a player to
 * supply here -- this fixed string plays the role SeedPair's per-user
 * clientSeed plays for Coinflip/Mines/Roulette, just constant instead
 * of player-chosen.
 */
const CRASH_CLIENT_SEED = 'crash-round';

/**
 * One server seed per round rather than SeedPair's one-seed-many-nonces
 * (see CrashRound's schema comment), so there is only ever one float to
 * derive per round and the nonce is always 0.
 */
const CRASH_NONCE = 0;

export type CrashRoundCommitment = {
  crashRoundId: string;
  serverSeedHash: string;
  /** Uniform in [0, 1). The caller (services/games/crash.ts) maps this to a crash point. */
  float: number;
};

/**
 * Generates a fresh house-level commitment and opens a new CrashRound
 * (status defaults to BETTING). Mirrors reserveRound's shape: the
 * caller receives a derived float, never the seed that produced it --
 * the raw serverSeed is read back only by revealCrashRoundSeed, once
 * the round is over.
 */
export async function createCrashRoundCommitment(): Promise<CrashRoundCommitment> {
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);

  const round = await prisma.crashRound.create({
    data: { serverSeed, serverSeedHash },
  });

  return {
    crashRoundId: round.id,
    serverSeedHash,
    float: deriveFloat(serverSeed, CRASH_CLIENT_SEED, CRASH_NONCE),
  };
}

export type RevealedCrashRoundSeed = {
  crashRoundId: string;
  serverSeed: string;
  serverSeedHash: string;
};

/**
 * Reads back a round's seed material for public reveal, once the round
 * has fully resolved. Unlike rotateSeedPair, this does not itself flip
 * any "closed" flag -- CrashRound's revealedAt is owned by
 * services/crash-engine's round loop, which sets it only after every
 * bet in the round has settled, not merely after the crash. This
 * function is a plain read of already-committed material for display,
 * not a state transition.
 */
export async function revealCrashRoundSeed(crashRoundId: string): Promise<RevealedCrashRoundSeed> {
  const round = await prisma.crashRound.findUniqueOrThrow({ where: { id: crashRoundId } });
  return {
    crashRoundId: round.id,
    serverSeed: round.serverSeed,
    serverSeedHash: round.serverSeedHash,
  };
}
