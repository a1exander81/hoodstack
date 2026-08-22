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
 * player's favor. Verified over ~200k simulated draws against a
 * disposable script (deleted after use, per this project's convention
 * for scripts/verify-*.ts -- see progress-tracker.md's Completed
 * section for the actual pass/fail record), the same rigor
 * services/rng's derivation got.
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
 * trusts a caller-supplied outcome -- which means it must not trust a
 * caller-supplied MULTIPLIER either. `deriveCrashPoint` validates its
 * own input; this function is equally reachable with bad data (a
 * corrupted cash-out record, a caller bug) and must defend itself the
 * same way, not assume its inputs already went through that function.
 */
export function resolveCrashBet(
  crashMultiplierBps: number,
  cashoutMultiplierBps: number | null,
  wagerMicroUsd: bigint,
): RoundResolution {
  if (!Number.isInteger(crashMultiplierBps) || crashMultiplierBps < BPS_PER_UNIT) {
    throw new Error(
      `crashMultiplierBps must be an integer >= ${BPS_PER_UNIT}, got ${crashMultiplierBps}`,
    );
  }
  if (
    cashoutMultiplierBps !== null &&
    (!Number.isInteger(cashoutMultiplierBps) || cashoutMultiplierBps < BPS_PER_UNIT)
  ) {
    throw new Error(
      `cashoutMultiplierBps must be an integer >= ${BPS_PER_UNIT}, got ${cashoutMultiplierBps}`,
    );
  }
  if (wagerMicroUsd < 0n) {
    throw new Error(`wagerMicroUsd must be non-negative, got ${wagerMicroUsd}`);
  }

  const won = cashoutMultiplierBps !== null && cashoutMultiplierBps < crashMultiplierBps;

  return {
    outcome: { crashMultiplierBps, cashoutMultiplierBps, won },
    payoutMicroUsd: won
      ? (wagerMicroUsd * BigInt(cashoutMultiplierBps)) / BigInt(BPS_PER_UNIT)
      : 0n,
  };
}

/**
 * Growth constant for the live multiplier curve, chosen so the curve
 * doubles roughly every 4 seconds -- a common crash-game pace, picked
 * for feel rather than derived from any other constant in this file.
 * multiplierBpsAtElapsedMs(t) = 10_000 * e^(GROWTH_PER_MS * t).
 *
 * This is display/timing math only -- it has no bearing on fairness.
 * The crash point is already fixed at round start by deriveCrashPoint;
 * this curve only decides how long the round takes to visually reach
 * that point, which is why its inverse (elapsedMsForMultiplierBps) is
 * safe for the round engine to use to schedule the CRASHED transition
 * instead of polling the tick value every iteration.
 */
const GROWTH_PER_MS = Math.log(2) / 4000;

/**
 * The live multiplier at a given elapsed time since RUNNING started.
 * Pure function of elapsedMs so it is testable without a real clock --
 * the round engine calls this every tick with real elapsed time, and a
 * test can call it with any fake value.
 */
export function multiplierBpsAtElapsedMs(elapsedMs: number): number {
  if (!(elapsedMs >= 0)) {
    throw new Error(`elapsedMs must be non-negative, got ${elapsedMs}`);
  }
  return Math.max(
    BPS_PER_UNIT,
    Math.floor(BPS_PER_UNIT * Math.exp(GROWTH_PER_MS * elapsedMs)),
  );
}

/**
 * Inverse of multiplierBpsAtElapsedMs: how long the curve takes to
 * reach a given multiplier. The round engine calls this once, at round
 * start, to know exactly when (in elapsed ms) to transition RUNNING ->
 * CRASHED.
 */
export function elapsedMsForMultiplierBps(crashMultiplierBps: number): number {
  if (!Number.isInteger(crashMultiplierBps) || crashMultiplierBps < BPS_PER_UNIT) {
    throw new Error(
      `crashMultiplierBps must be an integer >= ${BPS_PER_UNIT}, got ${crashMultiplierBps}`,
    );
  }
  return Math.log(crashMultiplierBps / BPS_PER_UNIT) / GROWTH_PER_MS;
}
