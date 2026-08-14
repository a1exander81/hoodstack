"use client";

import { useState } from "react";
import { formatMicroUsd, parseUsdToMicro, MICRO_PER_USD } from "@/lib/format";
import { payoutFor, type CoinSide } from "./dev-stubs";

const QUICK_AMOUNTS = [1n, 5n, 25n, 100n].map((usd) => usd * MICRO_PER_USD);

export function BetPanel({
  balanceMicroUsd,
  disabled,
  onFlip,
}: {
  balanceMicroUsd: bigint;
  disabled: boolean;
  onFlip: (wagerMicroUsd: bigint, side: CoinSide) => void;
}) {
  const [amountText, setAmountText] = useState("1.00");
  const [side, setSide] = useState<CoinSide>("heads");

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

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border-default bg-bg-surface p-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted">Table balance</p>
        <p className="font-mono text-2xl">{formatMicroUsd(balanceMicroUsd)}</p>
      </div>

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

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wider text-text-muted">Pick a side</p>
        <div className="grid grid-cols-2 gap-2">
          {(["heads", "tails"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSide(option)}
              aria-pressed={side === option}
              className={`rounded-md border px-3 py-2 capitalize ${
                side === option
                  ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                  : "border-border-default text-text-muted hover:text-text-primary"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-text-muted">Wins</span>
        <span className="font-mono">{valid ? formatMicroUsd(payoutFor(parsed)) : "\u2014"}</span>
      </div>

      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => valid && onFlip(parsed, side)}
        className="rounded-md bg-accent-primary px-4 py-3 font-semibold text-bg-base disabled:cursor-not-allowed disabled:opacity-40"
      >
        {disabled ? "Flipping\u2026" : "Flip"}
      </button>
    </section>
  );
}
