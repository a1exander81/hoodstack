import type { RoundResolution } from './types';

/** Basis points per 1.00x, matching COINFLIP_PAYOUT_BPS's convention. */
const BPS_PER_UNIT = 10_000;

/**
 * Probability mass reserved for an instant bust at exactly 1.00x -- the
 * house edge, applied as project-overview.md's House Edge table records
 * it: "1% instant-bust probability at 1.00x; the rest of the curve is
 * the fair distribution," not as a haircut on every payout the way
 * Coinflip's COINFLIP_PAYOUT_BPS is.
 */
const INSTANT_BUST_PROBABILITY = 0.01;

/**
 * Upper bound on any single round's crash point, in basis points.
 * Not part of the recorded house-edge decision -- the fair tail
 * (P(crash >= m) = 1/m) is mathematically unbounded, and a float
 * arbitrarily close to the instant-bust boundary produces an
 * arbitrarily large payout. This exists to bound worst-case exposure to
 * the house bankroll, not to bias the math below it: 100,000.00x is far
 * beyond any multiplier a real round has produced in comparable
 * products, so it clips a vanishingly rare tail rather than shaping the
 * distribution players actually experience.
 */
const MAX_CRASH_MULTIPLIER_BPS = 1_000_000_000; // 100,000.00x

/**
 * Maps a round's derived float to a crash multiplier, in basis points
 * (10_000 = 1.00x).
 *
 * Pure: no database, no clock. Given the same float this must return
 * the same crash point forever -- this is what a player re-derives from
 * CrashRound's revealed seed once the round is over.
 *
 * Construction: with probability INSTANT_BUST_PROBABILITY the round
 * busts at exactly 1.00x. Otherwise, the remaining probability mass is
 * mapped through the fair (zero-edge) crash distribution
 * P(crash >= m) = 1/m for m >= 1, via the standard 1/(1-u) inverse-CDF
 * construction on the rescaled remainder. That makes
 * P(crash >= c) = (1 - INSTANT_BUST_PROBABILITY) / c for every target
 * c > 1.00x -- a uniform 1% edge against any cashout target, not just
 * Coinflip-style even-money bets. Floored to the nearest basis point,
 * never rounded, so the edge is never given back by rounding in the
 * player's favor. Verified over ~200k simulated draws in
 * scripts/verify-crash.ts, the same rigor services/rng's derivation got.
 */
export function deriveCrashPoint(float: number): number {
  if (!(float >= 0 && float < 1)) {
    throw new Error(`float must be in [0, 1), got ${float}`);
  }

  if (float < INSTANT_BUST_PROBABILITY) {
    return BPS_PER_UNIT; // 1.00x
  }

  const u = (float - INSTANT_BUST_PROBABILITY) / (1 - INSTANT_BUST_PROBABILITY);
  const multiplierBps = Math.floor(BPS_PER_UNIT / (1 - u));
  return Math.min(multiplierBps, MAX_CRASH_MULTIPLIER_BPS);
}

/**
 * Resolves one player's bet against a round's already-determined crash
 * point.
 *
 * A bet with no cashoutMultiplierBps always loses -- there is no such
 * thing as "cashed out after the crash." A cashout only wins at a
 * multiplier strictly below the crash point: cashing out exactly AT the
 * crash point is the moment the round busts, not a valid escape from it.
 * This function is the single authority for that check; it does not
 * trust a caller-supplied "won" flag any more than resolveCoinflip
 * trusts a caller-supplied outcome.
 */
export function resolveCrashBet(
  crashMultiplierBps: number,
  cashoutMultiplierBps: number | null,
  wagerMicroUsd: bigint,
): RoundResolution {
  const won = cashoutMultiplierBps !== null && cashoutMultiplierBps < crashMultiplierBps;

  return {
    outcome: { crashMultiplierBps, cashoutMultiplierBps, won },
    payoutMicroUsd: won
      ? (wagerMicroUsd * BigInt(cashoutMultiplierBps as number)) / BigInt(BPS_PER_UNIT)
      : 0n,
  };
}
