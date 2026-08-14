/**
 * DEV STUBS -- NOT REAL IMPLEMENTATIONS.
 *
 * Everything in this file exists so the Coinflip UI can be built and
 * reviewed before services/rng and the wager path exist. Each stub is
 * deliberately inert rather than plausible:
 *
 *   - useTableBalance() returns a fixed amount and NEVER changes it.
 *     A stub that decremented on a loss would look exactly like a
 *     working ledger, which is the specific thing architecture.md's
 *     invariant 1 exists to prevent.
 *
 *   - resolveRound() is Math.random() with no seed, no commitment and
 *     no reveal. The real version is services/rng, which must hash a
 *     server seed BEFORE a bet is accepted (invariant 2).
 *
 * This whole file is deleted when the real wager path lands. Nothing
 * outside src/components/games/coinflip/ may import from it.
 */

export type CoinSide = "heads" | "tails";

/**
 * Payout on a winning flip, in basis points of the wager.
 *
 * 19_800 = 1.98x, i.e. a 1% house edge. This number is a PRODUCT
 * decision that no context file currently specifies -- it is a
 * placeholder chosen to be visibly not-2.00x rather than an answer.
 * See progress-tracker.md Open Questions.
 */
export const PAYOUT_BPS = 19_800n;

export function payoutFor(wagerMicroUsd: bigint): bigint {
  return (wagerMicroUsd * PAYOUT_BPS) / 10_000n;
}

/** Fixed. Does not move. See the file header. */
export function useTableBalance(): { balanceMicroUsd: bigint } {
  return { balanceMicroUsd: 250_000_000n };
}

/** Unseeded, uncommitted, unverifiable. See the file header. */
export function resolveRound(): CoinSide {
  return Math.random() < 0.5 ? "heads" : "tails";
}
