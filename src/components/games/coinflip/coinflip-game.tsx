"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { BetPanel } from "./bet-panel";
import { Coin } from "./coin";
import { RoundHistory } from "./round-history";
import type { CoinflipRound, SeedCommitmentView } from "./types";
import type { CoinSide } from "@services/games";

const MAX_VISIBLE_ROUNDS = 10;

type Pending = {
  round: CoinflipRound;
  nextBalanceMicroUsd: bigint;
};

export function CoinflipGame() {
  const { getAccessToken } = usePrivy();
  const [balanceMicroUsd, setBalanceMicroUsd] = useState<bigint | null>(null);
  const [commitment, setCommitment] = useState<SeedCommitmentView | null>(null);
  const [rounds, setRounds] = useState<CoinflipRound[]>([]);
  const [flipping, setFlipping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/games/session", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`session ${response.status}`);
      const data = await response.json();
      setBalanceMicroUsd(BigInt(data.balanceMicroUsd));
      setCommitment(data.commitment);
      setError(null);
    } catch {
      setError("Could not load your table balance.");
    }
  }, [getAccessToken]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleFlip = async (wagerMicroUsd: bigint, side: CoinSide) => {
    if (flipping || submitting || !commitment) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/games/coinflip", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          wagerMicroUsd: wagerMicroUsd.toString(),
          side,
          serverSeedHash: commitment.serverSeedHash,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // Pair rotated underneath us. Adopt the new commitment; the player
        // re-bets against a hash they can now see.
        setCommitment(data.commitment);
        setError("Your seed pair changed. Check the new commitment and flip again.");
        return;
      }
      if (!response.ok) {
        setError(data?.error ?? "Round failed.");
        if (data?.balanceMicroUsd) setBalanceMicroUsd(BigInt(data.balanceMicroUsd));
        return;
      }

      // Balance is held back until the coin lands -- showing it now would
      // reveal the outcome before the animation does.
      setPending({
        round: {
          id: data.gameRoundId,
          side: data.side,
          result: data.result,
          won: data.won,
          wagerMicroUsd: BigInt(data.wagerMicroUsd),
          payoutMicroUsd: BigInt(data.payoutMicroUsd),
          nonce: data.nonce,
        },
        nextBalanceMicroUsd: BigInt(data.balanceMicroUsd),
      });
      setCommitment((current) =>
        current ? { ...current, nonce: data.nonce } : current,
      );
      setFlipping(true);
    } catch {
      setError("Could not reach the table. Nothing was wagered.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettled = () => {
    setFlipping(false);
    if (!pending) return;
    setBalanceMicroUsd(pending.nextBalanceMicroUsd);
    setRounds((current) => [pending.round, ...current].slice(0, MAX_VISIBLE_ROUNDS));
    setPending(null);
  };

  const latest = rounds[0];
  const displayedSide = (pending?.round.result ?? latest?.result ?? "HEADS") as CoinSide;

  const status = flipping
    ? "Flipping\u2026"
    : submitting
      ? "Placing your bet\u2026"
      : latest
        ? latest.won
          ? "You called it."
          : "Not this time."
        : "Pick a side and flip.";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:grid lg:grid-cols-[320px_1fr_300px] lg:items-start">
      <div className="order-2 lg:order-1">
        {balanceMicroUsd === null ? (
          <div className="rounded-xl border border-border-default bg-bg-surface p-5 text-sm text-text-muted">
            Loading your table balance&hellip;
          </div>
        ) : (
          <BetPanel
            balanceMicroUsd={balanceMicroUsd}
            disabled={flipping || submitting}
            onFlip={(wager, side) => void handleFlip(wager, side)}
          />
        )}
      </div>

      <div className="order-1 flex flex-col items-center gap-4 lg:order-2">
        <Coin side={displayedSide} flipping={flipping} onSettled={handleSettled} />
        <p className="h-6 text-sm text-text-muted">{status}</p>
        {error ? (
          <p role="alert" className="max-w-sm text-center text-sm text-state-error">
            {error}
          </p>
        ) : null}
      </div>

      <div className="order-3">
        <RoundHistory rounds={rounds} commitment={commitment} />
      </div>
    </div>
  );
}
