// Wire types for game-engine/index.ts's Socket.io contract. The broadcast
// event payloads (round:*) carry only numbers/strings and mirror the
// server's shapes exactly. The ack payloads are declared separately as
// string-based DTOs, NOT imported from @services/ledger: the server acks
// now serialize PlaceCrashBetResult/SettleCrashBetResult's bigint fields to
// strings before sending (Socket.io's default JSON parser throws on a raw
// bigint -- see game-engine/index.ts's serializePlaceCrashBetResult), so
// the wire shape is never actually the ledger's own bigint-bearing type.
// Importing that type here would also pull a Prisma-touching barrel into a
// client component's bundle for no reason.

export type RoundStateSnapshot =
  | { phase: "BETWEEN_ROUNDS" }
  | {
      phase: "BETTING";
      crashRoundId: string;
      serverSeedHash: string;
      bettingOpenedAt: number;
      bettingWindowMs: number;
    }
  | { phase: "RUNNING"; crashRoundId: string; elapsedMs: number };

export type BettingOpenPayload = {
  crashRoundId: string;
  serverSeedHash: string;
  bettingWindowMs: number;
};

export type RunningPayload = { crashRoundId: string };

export type TickPayload = { crashRoundId: string; multiplierBps: number; elapsedMs: number };

export type CrashedPayload = { crashRoundId: string; crashMultiplierBps: number };

export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export type PlaceCrashBetAckData = {
  status: "placed" | "already-placed";
  crashBetId: string;
  balanceMicroUsd: string;
};

export type SettleCrashBetAckData = {
  status: "settled" | "already-settled";
  crashBetId: string;
  won: boolean;
  payoutMicroUsd: string;
  balanceMicroUsd: string;
};

/**
 * This client's own bet in the CURRENT round, tracked only in this tab's
 * local state -- round:state's on-connect snapshot has no per-player bet
 * info, so a page reload mid-round loses track of an already-placed bet.
 * Deliberately left out of scope rather than silently half-handled; see
 * crash-game.tsx's banner, which says so to the player rather than only
 * in the tracker.
 */
export type MyBet = {
  crashRoundId: string;
  wagerMicroUsd: bigint;
  status: "placed" | "cashed_out";
  cashoutMultiplierBps?: number;
  payoutMicroUsd?: bigint;
};

export type CrashHistoryEntry = {
  crashRoundId: string;
  crashMultiplierBps: number;
};
