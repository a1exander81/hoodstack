"use client";

import { useState } from "react";
import { formatMicroUsd, parseUsdToMicro, MICRO_PER_USD } from "@/lib/format";
import type { MyBet, RoundStateSnapshot } from "./types";

const QUICK_AMOUNTS = [1n, 5n, 25n, 100n].map((usd) => usd * MICRO_PER_USD);

function previewCashout(wagerMicroUsd: bigint, multiplierBps: number): bigint {
  return (wagerMicroUsd * BigInt(multiplierBps)) / 10_000n;
}

export function BetPanel({
  balanceMicroUsd,
  roundState,
  myBet,
  liveMultiplierBps,
  connected,
  submitting,
  onPlaceBet,
  onCashout,
}: {
  balanceMicroUsd: bigint;
  roundState: RoundStateSnapshot;
  myBet: MyBet | null;
  liveMultiplierBps: number;
  connected: boolean;
  submitting: boolean;
  onPlaceBet: (wagerMicroUsd: bigint) => void;
  onCashout: () => void;
}) {
  const [amountText, setAmountText] = useState("1.00");

  const parsed = parseUsdToMicro(amountText);
  const malformed = parsed === null;
  const tooSmall = parsed !== null && parsed <= 0n;
  const tooLarge = parsed !== null && parsed > balanceMicroUsd;
  const valid = parsed !== null && !tooSmall && !tooLarge;

  const setFromMicro = (micro: bigint) => {
    const clamped = micro > balanceMicroUsd ? balanceMicroUsd : micro;
    setAmountText(formatMicroUsd(clamped).replace("$", "").replace(/,/g, ""));
  };

  const error = malformed
    ? "Enter an amount like 12.50"
    : tooSmall
      ? "Wager must be more than $0"
      : tooLarge
        ? "More than your table balance"
        : null;

  const canPlaceBet = connected && !submitting && roundState.phase === "BETTING" && myBet === null;

  const inThisRound =
    myBet !== null &&
    ((roundState.phase === "RUNNING" && roundState.crashRoundId === myBet.crashRoundId) ||
      (roundState.phase === "BETTING" && roundState.crashRoundId === myBet.crashRoundId) ||
      roundState.phase === "BETWEEN_ROUNDS");

  const canCashout =
    connected &&
    !submitting &&
    myBet?.status === "placed" &&
    inThisRound &&
    roundState.phase === "RUNNING";

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border-default bg-bg-surface p-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted">Table balance</p>
        <p className="font-mono text-2xl">{formatMicroUsd(balanceMicroUsd)}</p>
      </div>

      {myBet && inThisRound ? (
        <BetStatus
          myBet={myBet}
          roundState={roundState}
          liveMultiplierBps={liveMultiplierBps}
          submitting={submitting}
          canCashout={canCashout}
          onCashout={onCashout}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="wager" className="text-xs uppercase tracking-wider text-text-muted">
              Wager
            </label>
            <input
              id="wager"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              className={`rounded-md border bg-bg-base px-3 py-2 font-mono text-lg outline-none focus:border-accent-primary ${
                error ? "border-state-error" : "border-border-default"
              }`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "wager-error" : undefined}
            />
            {error ? (
              <p id="wager-error" className="text-sm text-state-error">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((micro) => (
                <button
                  key={micro.toString()}
                  type="button"
                  onClick={() => setFromMicro(micro)}
                  className="rounded-md border border-border-default px-3 py-1 text-sm text-text-muted hover:border-accent-primary hover:text-text-primary"
                >
                  {formatMicroUsd(micro)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => parsed !== null && setFromMicro(parsed / 2n)}
                className="rounded-md border border-border-default px-3 py-1 text-sm text-text-muted hover:border-accent-primary hover:text-text-primary"
              >
                &frac12;
              </button>
              <button
                type="button"
                onClick={() => parsed !== null && setFromMicro(parsed * 2n)}
                className="rounded-md border border-border-default px-3 py-1 text-sm text-text-muted hover:border-accent-primary hover:text-text-primary"
              >
                2&times;
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={!canPlaceBet || !valid}
            onClick={() => valid && onPlaceBet(parsed)}
            className="rounded-md bg-accent-primary px-4 py-3 font-semibold text-bg-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {roundState.phase === "BETTING"
              ? submitting
                ? "Placing bet…"
                : "Place Bet"
              : "Betting closed"}
          </button>
        </>
      )}
    </section>
  );
}

function BetStatus({
  myBet,
  roundState,
  liveMultiplierBps,
  submitting,
  canCashout,
  onCashout,
}: {
  myBet: MyBet;
  roundState: RoundStateSnapshot;
  liveMultiplierBps: number;
  submitting: boolean;
  canCashout: boolean;
  onCashout: () => void;
}) {
  if (myBet.status === "cashed_out") {
    const won = (myBet.payoutMicroUsd ?? 0n) > 0n;
    return (
      <div className="rounded-md border border-border-default p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-text-muted">Your bet</p>
        {won ? (
          <p className="mt-1 font-mono text-state-success">
            Cashed out at {((myBet.cashoutMultiplierBps ?? 0) / 10_000).toFixed(2)}x &mdash; +
            {formatMicroUsd(myBet.payoutMicroUsd ?? 0n)}
          </p>
        ) : (
          <p className="mt-1 text-text-muted">
            Cash-out arrived just after the crash &mdash; treated as a loss.
          </p>
        )}
      </div>
    );
  }

  if (roundState.phase === "RUNNING") {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border-default p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-text-muted">Your bet</p>
        <p className="font-mono">{formatMicroUsd(myBet.wagerMicroUsd)}</p>
        <button
          type="button"
          disabled={!canCashout}
          onClick={onCashout}
          className="rounded-md bg-state-success px-4 py-3 font-semibold text-bg-base disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting
            ? "Cashing out…"
            : `Cash Out ${formatMicroUsd(previewCashout(myBet.wagerMicroUsd, liveMultiplierBps))}`}
        </button>
      </div>
    );
  }

  if (roundState.phase === "BETTING") {
    // Bet already placed for this same round (roundState.crashRoundId ===
    // myBet.crashRoundId, guaranteed by the inThisRound check the caller
    // already did) -- locked in, waiting for it to start running.
    return (
      <div className="rounded-md border border-border-default p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-text-muted">Your bet</p>
        <p className="mt-1 font-mono">
          {formatMicroUsd(myBet.wagerMicroUsd)} &mdash; locked in, waiting for the round to start.
        </p>
      </div>
    );
  }

  // phase === "BETWEEN_ROUNDS": the round this bet belonged to crashed and
  // was never cashed out -- a normal loss, not an error state (same
  // posture as coinflip's round-history.tsx toward a losing round).
  return (
    <div className="rounded-md border border-border-default p-4 text-sm">
      <p className="text-xs uppercase tracking-wider text-text-muted">Your bet</p>
      <p className="mt-1 text-text-muted">
        Lost {formatMicroUsd(myBet.wagerMicroUsd)} &mdash; round crashed before you cashed out.
      </p>
    </div>
  );
}
