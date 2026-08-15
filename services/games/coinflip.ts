import type { RoundResolution } from './types';

export type CoinSide = 'HEADS' | 'TAILS';

/**
 * Payout on a winning flip, in basis points of the wager.
 *
 * 19_800 = 1.98x on an even-money bet, i.e. a 1% house edge. This is a
 * RECORDED PRODUCT DECISION (see project-overview.md "House Edge"), not
 * the placeholder that previously sat in dev-stubs.ts: 1% uniform across
 * Coinflip, Crash and Mines, with Roulette's 2.70% coming structurally
 * from a single-zero wheel rather than from a multiplier.
 */
export const COINFLIP_PAYOUT_BPS = 19_800n;

export function isCoinSide(value: unknown): value is CoinSide {
  return value === 'HEADS' || value === 'TAILS';
}

/**
 * Maps a round's derived float to a coinflip outcome and its payout.
 *
 * Pure: no database, no clock, no randomness of its own. The float comes
 * from services/rng's reserveRound(), which derived it from a server seed
 * whose hash was published before the bet (architecture.md invariant 2).
 * Given the same float and bet this function must return the same result
 * forever, because that is what a player re-deriving a settled round from
 * a revealed seed will compute.
 *
 * The half-open split at 0.5 is exact: deriveFloat() returns a uint32
 * divided by 2^32, so the two sides get precisely 2^31 outcomes each.
 */
export function resolveCoinflip(
  float: number,
  side: CoinSide,
  wagerMicroUsd: bigint,
): RoundResolution {
  if (!(float >= 0 && float < 1)) {
    throw new Error(`float must be in [0, 1), got ${float}`);
  }

  const result: CoinSide = float < 0.5 ? 'HEADS' : 'TAILS';
  const won = result === side;

  return {
    outcome: { side, result, won },
    payoutMicroUsd: won ? (wagerMicroUsd * COINFLIP_PAYOUT_BPS) / 10_000n : 0n,
  };
}
