import "./load-env";

import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { resolveAuthenticatedDid } from "../services/settlement";
import {
  placeCrashBet,
  settleCrashBet,
  RoundNotOpenForBettingError,
  DuplicateBetWagerMismatchError,
  InsufficientBalanceError,
  type PlaceCrashBetResult,
  type SettleCrashBetResult,
} from "../services/ledger";
import { multiplierBpsAtElapsedMs } from "../services/games";
import { runCrashRound, type RunningRoundHandle } from "../services/crash-engine";

// ---------------------------------------------------------------------------
// Env validation -- same "hard guard on anything dangerous, soft default on
// anything operational" split as facilitator/index.ts.
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.GAME_ENGINE_PORT ?? "4023", 10);
if (!Number.isInteger(PORT) || PORT <= 0) {
  console.error(`Invalid GAME_ENGINE_PORT: ${process.env.GAME_ENGINE_PORT}`);
  process.exit(1);
}

const CORS_ORIGIN = process.env.GAME_ENGINE_CORS_ORIGIN ?? "http://localhost:3000";

const BETTING_WINDOW_MS = 5_000;
const TICK_INTERVAL_MS = 100;
const BETWEEN_ROUNDS_DELAY_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Engine state -- the single source of truth this process holds about the
// CURRENT round, for two purposes: (1) telling a newly-connected or
// reconnecting socket what's happening right now, without waiting for the
// next broadcast, and (2) giving bet:cashout something to compute a live
// multiplier from. crashMultiplierBps only ever lives inside the RUNNING
// variant's `handle`, in that closure, exactly per round-loop.ts's own
// invariant -- never logged, never put in a broadcast payload, never read
// by anything other than the cashout handler below.
// ---------------------------------------------------------------------------

type EngineState =
  | { phase: "BETWEEN_ROUNDS" }
  | {
      phase: "BETTING";
      crashRoundId: string;
      serverSeedHash: string;
      bettingOpenedAt: number;
      bettingWindowMs: number;
    }
  | { phase: "RUNNING"; crashRoundId: string; handle: RunningRoundHandle };

let engineState: EngineState = { phase: "BETWEEN_ROUNDS" };

function stateSnapshot() {
  if (engineState.phase === "RUNNING") {
    return {
      phase: "RUNNING" as const,
      crashRoundId: engineState.crashRoundId,
      elapsedMs: engineState.handle.getElapsedMs(),
    };
  }
  if (engineState.phase === "BETTING") {
    return {
      phase: "BETTING" as const,
      crashRoundId: engineState.crashRoundId,
      serverSeedHash: engineState.serverSeedHash,
      bettingOpenedAt: engineState.bettingOpenedAt,
      bettingWindowMs: engineState.bettingWindowMs,
    };
  }
  return { phase: "BETWEEN_ROUNDS" as const };
}

// ---------------------------------------------------------------------------
// HTTP + Socket.io
// ---------------------------------------------------------------------------

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

// Socket-adapted resolveAuthenticatedDid -- the function itself is already
// transport-agnostic (a plain string in, a DID out); this middleware is the
// only new plumbing, mapping the handshake's auth token onto the same
// "Bearer <token>" shape the HTTP routes already pass it.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length === 0) {
      throw new Error("missing auth token");
    }
    socket.data.userId = await resolveAuthenticatedDid(`Bearer ${token}`);
    next();
  } catch {
    next(new Error("authentication failed"));
  }
});

// wagerMicroUsd as a regex-checked string, not a raw bigint/number --
// same convention as the coinflip route's request schema, since bigint
// isn't a JSON type and z.coerce.bigint()'s z.input<> type is pinned to
// bigint regardless (a known quirk elsewhere in this codebase).
const placeBetPayloadSchema = z.object({
  crashRoundId: z.string().min(1),
  wagerMicroUsd: z.string().regex(/^[1-9]\d*$/, "must be a positive integer string"),
});

const cashoutPayloadSchema = z.object({
  crashRoundId: z.string().min(1),
});

type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function errorAck(err: unknown): { ok: false; code: string; message: string } {
  if (err instanceof RoundNotOpenForBettingError) {
    return { ok: false, code: "ROUND_NOT_OPEN", message: err.message };
  }
  if (err instanceof DuplicateBetWagerMismatchError) {
    return { ok: false, code: "WAGER_MISMATCH", message: err.message };
  }
  if (err instanceof InsufficientBalanceError) {
    return { ok: false, code: "INSUFFICIENT_BALANCE", message: err.message };
  }
  if (err instanceof z.ZodError) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: err.issues.map((issue) => issue.message).join("; "),
    };
  }
  return {
    ok: false,
    code: "INTERNAL",
    message: err instanceof Error ? err.message : "unknown error",
  };
}

io.on("connection", (socket: Socket) => {
  // A client connecting mid-round gets the current phase immediately,
  // rather than waiting for the next round:betting_open/running broadcast.
  socket.emit("round:state", stateSnapshot());

  socket.on(
    "bet:place",
    async (rawPayload: unknown, ack?: (response: AckResponse<PlaceCrashBetResult>) => void) => {
      try {
        const payload = placeBetPayloadSchema.parse(rawPayload);
        // placeCrashBet row-locks CrashRound and checks status = BETTING
        // itself -- that DB check is the real authority. This function
        // does not pre-gate on engineState.phase; a stale/wrong
        // crashRoundId or a round that already closed comes back as a
        // normal RoundNotOpenForBettingError ack below, not a crash.
        const result = await placeCrashBet({
          userId: socket.data.userId,
          crashRoundId: payload.crashRoundId,
          wagerMicroUsd: BigInt(payload.wagerMicroUsd),
        });
        ack?.({ ok: true, data: result });
      } catch (err) {
        ack?.(errorAck(err));
      }
    },
  );

  socket.on(
    "bet:cashout",
    async (rawPayload: unknown, ack?: (response: AckResponse<SettleCrashBetResult>) => void) => {
      try {
        const payload = cashoutPayloadSchema.parse(rawPayload);
        // Unlike bet:place, there is no DB fallback here -- cashing out
        // needs THIS process's privately-held crashMultiplierBps, which
        // only exists in engineState while RUNNING. If the round isn't
        // RUNNING in this process's own view, there is nothing to
        // compute a cash-out multiplier from.
        if (engineState.phase !== "RUNNING") {
          throw new Error("round is not currently running");
        }
        const handle = engineState.handle;
        if (payload.crashRoundId !== handle.crashRoundId) {
          throw new Error("cash-out request does not match the currently running round");
        }
        // Derived from this process's own clock, never from the client --
        // a player's socket message only ever means "cash me out now."
        const cashoutMultiplierBps = multiplierBpsAtElapsedMs(handle.getElapsedMs());
        const result = await settleCrashBet({
          userId: socket.data.userId,
          crashRoundId: handle.crashRoundId,
          crashMultiplierBps: handle.crashMultiplierBps,
          cashoutMultiplierBps,
        });
        ack?.({ ok: true, data: result });
      } catch (err) {
        ack?.(errorAck(err));
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Game loop -- schedules rounds back to back. runCrashRound itself only
// ever runs ONE round; this is the thin repeat-forever wrapper the plan
// calls for. Wrapped in try/catch so a single round's failure (a
// RoundTransitionError, a DB hiccup) logs loudly and starts a fresh round
// after a delay, rather than silently killing the whole engine process.
// ---------------------------------------------------------------------------

async function gameLoop() {
  for (;;) {
    try {
      await runCrashRound({
        bettingWindowMs: BETTING_WINDOW_MS,
        tickIntervalMs: TICK_INTERVAL_MS,
        onBettingOpen: ({ crashRoundId, serverSeedHash }) => {
          // State assignment first, before the emit that can throw --
          // see round-loop.ts's safeCallback: a throwing callback is
          // caught and logged, but must not leave engineState stale.
          engineState = {
            phase: "BETTING",
            crashRoundId,
            serverSeedHash,
            bettingOpenedAt: Date.now(),
            bettingWindowMs: BETTING_WINDOW_MS,
          };
          io.emit("round:betting_open", {
            crashRoundId,
            serverSeedHash,
            bettingWindowMs: BETTING_WINDOW_MS,
          });
        },
        onRunning: (handle) => {
          engineState = { phase: "RUNNING", crashRoundId: handle.crashRoundId, handle };
          io.emit("round:running", { crashRoundId: handle.crashRoundId });
        },
        onTick: ({ crashRoundId, multiplierBps, elapsedMs }) => {
          io.emit("round:tick", { crashRoundId, multiplierBps, elapsedMs });
        },
        onCrashed: ({ crashRoundId, crashMultiplierBps }) => {
          io.emit("round:crashed", { crashRoundId, crashMultiplierBps });
        },
      });
    } catch (err) {
      console.error("[game-engine] round failed; starting a new one after a delay:", err);
    }
    engineState = { phase: "BETWEEN_ROUNDS" };
    await sleep(BETWEEN_ROUNDS_DELAY_MS);
  }
}

gameLoop().catch((err) => {
  console.error("[game-engine] game loop crashed unexpectedly, exiting:", err);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`[game-engine] listening on :${PORT}`);
});
