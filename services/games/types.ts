/**
 * Shared shape for every game's pure resolver.
 *
 * `outcome` is persisted to GameRound.outcome (Json) for display and
 * dispute. It is never the source of truth for money -- that is the
 * LedgerEntry rows -- and it is never trusted from a client.
 */
export type RoundResolution = {
  outcome: Record<string, unknown>;
  /** Total returned to the player on a win, INCLUDING their stake. 0 on a loss. */
  payoutMicroUsd: bigint;
};
