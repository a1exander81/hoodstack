"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { io, type Socket } from "socket.io-client";
import { BetPanel } from "./bet-panel";
import { MultiplierDisplay } from "./multiplier-display";
import { RoundHistory } from "./round-history";
import type {
  AckResponse,
  BettingOpenPayload,
  CrashHistoryEntry,
  CrashedPayload,
  MyBet,
  PlaceCrashBetAckData,
  RoundStateSnapshot,
  RunningPayload,
  SettleCrashBetAckData,
  TickPayload,
} from "./types";

const MAX_HISTORY = 12;

const GAME_ENGINE_URL =
  process.env.NEXT_PUBLIC_GAME_ENGINE_URL ?? "http://localhost:4023";

export function CrashGame() {
  const { getAccessToken } = usePrivy();
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const [balanceMicroUsd, setBalanceMicroUsd] = useState<bigint | null>(null);
  const [roundState, setRoundState] = useState<RoundStateSnapshot>({
    phase: "BETWEEN_ROUNDS",
  });
  const [liveMultiplierBps, setLiveMultiplierBps] = useState(10_000);
  const [justCrashed, setJustCrashed] = useState<CrashedPayload | null>(null);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [myBet, setMyBet] = useState<MyBet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const token = await getAccessToken();
        // Reused from Coinflip: balance is game-agnostic. Its `commitment`
        // field is Coinflip's own seed-pair commitment, not Crash's --
        // Crash's commitment comes from the socket's round:betting_open /
        // round:state instead (architecture.md invariant 2's Crash case),
        // so that field is deliberately ignored here.
        const response = await fetch("/api/games/session", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`session ${response.status}`);
        const data = await response.json();
        setBalanceMicroUsd(BigInt(data.balanceMicroUsd));
      } catch {
        setError("Could not load your table balance.");
      }
    };
    void loadBalance();
  }, [getAccessToken]);

  useEffect(() => {
    const socket = io(GAME_ENGINE_URL, {
      // Invoked fresh on every (re)connect attempt, so a token that expired
      // between connects is refreshed rather than reused -- this is the
      // "reconnect/expiry handling" the milestone plan called new work,
      // not new Privy plumbing.
      auth: (cb) => {
        void getAccessToken().then((token) => cb({ token: token ?? "" }));
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setAuthFailed(false);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err: Error) => {
      setConnected(false);
      if (err.message === "authentication failed") {
        setAuthFailed(true);
      }
    });

    socket.on("round:state", (snapshot: RoundStateSnapshot) => {
      setRoundState(snapshot);
      if (snapshot.phase === "RUNNING") setLiveMultiplierBps(10_000);
    });

    socket.on("round:betting_open", (payload: BettingOpenPayload) => {
      // A new round starting is the one unambiguous point to drop any bet
      // tracked against the PREVIOUS round -- its outcome has already been
      // shown (cashed out or crashed) by the time this fires.
      setMyBet(null);
      setJustCrashed(null);
      setLiveMultiplierBps(10_000);
      setRoundState({
        phase: "BETTING",
        crashRoundId: payload.crashRoundId,
        serverSeedHash: payload.serverSeedHash,
        bettingOpenedAt: Date.now(),
        bettingWindowMs: payload.bettingWindowMs,
      });
    });

    socket.on("round:running", (payload: RunningPayload) => {
      setLiveMultiplierBps(10_000);
      setRoundState({ phase: "RUNNING", crashRoundId: payload.crashRoundId, elapsedMs: 0 });
    });

    socket.on("round:tick", (payload: TickPayload) => {
      setLiveMultiplierBps(payload.multiplierBps);
    });

    socket.on("round:crashed", (payload: CrashedPayload) => {
      setJustCrashed(payload);
      setRoundState({ phase: "BETWEEN_ROUNDS" });
      setHistory((current) =>
        [{ crashRoundId: payload.crashRoundId, crashMultiplierBps: payload.crashMultiplierBps }, ...current].slice(
          0,
          MAX_HISTORY,
        ),
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [getAccessToken]);

  const handlePlaceBet = useCallback(
    (wagerMicroUsd: bigint) => {
      const socket = socketRef.current;
      if (!socket || roundState.phase !== "BETTING" || submitting) return;
      const crashRoundId = roundState.crashRoundId;

      setSubmitting(true);
      setError(null);
      socket.emit(
        "bet:place",
        { crashRoundId, wagerMicroUsd: wagerMicroUsd.toString() },
        (response: AckResponse<PlaceCrashBetAckData>) => {
          setSubmitting(false);
          if (!response.ok) {
            setError(response.message);
            return;
          }
          setBalanceMicroUsd(BigInt(response.data.balanceMicroUsd));
          setMyBet({ crashRoundId, wagerMicroUsd, status: "placed" });
        },
      );
    },
    [roundState, submitting],
  );

  const handleCashout = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || roundState.phase !== "RUNNING" || !myBet || submitting) return;
    const crashRoundId = roundState.crashRoundId;

    setSubmitting(true);
    setError(null);
    socket.emit(
      "bet:cashout",
      { crashRoundId },
      (response: AckResponse<SettleCrashBetAckData>) => {
        setSubmitting(false);
        if (!response.ok) {
          setError(response.message);
          return;
        }
        // ok:true does not mean won -- a cash-out that lands just after the
        // crash point comes back {status:'settled', won:false,
        // payoutMicroUsd:'0'} (settle-crash-bet.ts's defensively-rejected
        // path). Balance only ever updates from this ack; a genuine loss
        // sweep writes no further ledger row, so there's nothing to
        // refetch on the losing branch.
        setBalanceMicroUsd(BigInt(response.data.balanceMicroUsd));
        const payoutMicroUsd = BigInt(response.data.payoutMicroUsd);
        setMyBet((current) =>
          current
            ? {
                ...current,
                status: "cashed_out",
                // Derived from the ack's own authoritative payoutMicroUsd,
                // NOT liveMultiplierBps -- that's whatever tick was on
                // screen when the player clicked, and round:tick keeps
                // advancing during the round-trip, so it can visibly
                // disagree with what was actually settled. This division
                // is exact enough for a 2-decimal "x" display even though
                // it can't perfectly invert resolveCrashBet's own floor
                // (bounded to well under 1 basis point of drift), and it
                // holds for both the 'settled' and 'already-settled' ack
                // branches alike, unlike threading the engine's transient
                // cashoutMultiplierBps variable through the wire would.
                cashoutMultiplierBps:
                  payoutMicroUsd > 0n
                    ? Number((payoutMicroUsd * 10_000n) / current.wagerMicroUsd)
                    : 0,
                payoutMicroUsd,
              }
            : current,
        );
      },
    );
  }, [roundState, myBet, submitting]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:grid lg:grid-cols-[320px_1fr_300px] lg:items-start">
      <div className="order-2 sticky bottom-0 z-10 -mx-4 bg-bg-base/95 px-4 pb-4 backdrop-blur lg:static lg:order-1 lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        {balanceMicroUsd === null ? (
          <div className="rounded-xl border border-border-default bg-bg-surface p-5 text-sm text-text-muted">
            Loading your table balance&hellip;
          </div>
        ) : (
          <BetPanel
            balanceMicroUsd={balanceMicroUsd}
            roundState={roundState}
            myBet={myBet}
            liveMultiplierBps={liveMultiplierBps}
            connected={connected}
            submitting={submitting}
            onPlaceBet={handlePlaceBet}
            onCashout={handleCashout}
          />
        )}
      </div>

      <div className="order-1 flex flex-col items-center gap-4 lg:order-2">
        <div className="flex h-64 w-full items-center justify-center rounded-xl border border-border-default bg-bg-surface">
          <MultiplierDisplay
            roundState={roundState}
            liveMultiplierBps={liveMultiplierBps}
            justCrashed={justCrashed}
          />
        </div>

        {!connected ? (
          <p className="text-sm text-text-muted">
            {authFailed ? "Session expired — sign in again to reconnect." : "Connecting…"}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="max-w-sm text-center text-sm text-state-error">
            {error}
          </p>
        ) : null}
        <p className="max-w-sm text-center text-xs text-text-muted">
          Reloading this page loses track of a bet already placed in the
          current round — it stays debited and cannot be cashed out from
          here until the round ends.
        </p>
      </div>

      <div className="order-3">
        <RoundHistory history={history} />
      </div>
    </div>
  );
}
