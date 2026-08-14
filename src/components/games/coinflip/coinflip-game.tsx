"use client";

import { useState } from "react";
import { BetPanel } from "./bet-panel";
import { Coin } from "./coin";
import { RoundHistory, type CoinflipRound } from "./round-history";
import { payoutFor, resolveRound, useTableBalance, type CoinSide } from "./dev-stubs";

const MAX_VISIBLE_ROUNDS = 10;

export function CoinflipGame() {
  const { balanceMicroUsd } = useTableBalance();
  const [rounds, setRounds] = useState<CoinflipRound[]>([]);
  const [flipping, setFlipping] = useState(false);
  const [pending, setPending] = useState<{
    side: CoinSide;
    result: CoinSide;
    wagerMicroUsd: bigint;
  } | null>(null);

  const handleFlip = (wagerMicroUsd: bigint, side: CoinSide) => {
    if (flipping) return;
    // Resolved up front so the animation lands on a decided outcome
    // rather than the animation deciding it. The real version resolves
    // server-side against a pre-committed seed.
    setPending({ side, result: resolveRound(), wagerMicroUsd });
    setFlipping(true);
  };

  const handleSettled = () => {
    setFlipping(false);
    if (!pending) return;
    const won = pending.side === pending.result;
    setRounds((current) =>
      [
        {
          id: `${Date.now()}-${current.length}`,
          side: pending.side,
          result: pending.result,
          wagerMicroUsd: pending.wagerMicroUsd,
          payoutMicroUsd: won ? payoutFor(pending.wagerMicroUsd) : 0n,
        },
        ...current,
      ].slice(0, MAX_VISIBLE_ROUNDS),
    );
  };

  const latest = rounds[0];
  const displayedSide: CoinSide = pending?.result ?? latest?.result ?? "heads";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:grid lg:grid-cols-[320px_1fr_300px] lg:items-start">
      <div className="order-2 lg:order-1">
        <BetPanel
          balanceMicroUsd={balanceMicroUsd}
          disabled={flipping}
          onFlip={handleFlip}
        />
      </div>

      <div className="order-1 flex flex-col items-center gap-4 lg:order-2">
        <Coin side={displayedSide} flipping={flipping} onSettled={handleSettled} />
        <p className="h-6 text-sm text-text-muted">
          {flipping
            ? "Flipping\u2026"
            : latest
              ? latest.side === latest.result
                ? "You called it."
                : "Not this time."
              : "Pick a side and flip."}
        </p>
      </div>

      <div className="order-3">
        <RoundHistory rounds={rounds} />
      </div>
    </div>
  );
}
