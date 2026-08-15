// Client-side shapes for the Coinflip surface.
//
// CoinSide is re-exported from services/games rather than redeclared, so the
// UI and the resolver can never drift on casing. services/games is pure --
// no database, no node built-ins -- so it is safe in a client bundle.

export type { CoinSide } from "@services/games";

export type SeedCommitmentView = {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
};

export type CoinflipRound = {
  id: string;
  side: string;
  result: string;
  won: boolean;
  wagerMicroUsd: bigint;
  payoutMicroUsd: bigint;
  nonce: number;
};
