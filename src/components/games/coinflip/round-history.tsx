"use client";

import { useState } from "react";
import { formatMicroUsd } from "@/lib/format";
import type { CoinflipRound, SeedCommitmentView } from "./types";

/**
 * A losing round is a normal outcome, not an error -- state-error is
 * reserved for things that actually went wrong (a failed request, an
 * insufficient-balance rejection). Showing the real signed amount in a
 * muted tone, same as a win shows its real amount, keeps that
 * distinction visible instead of flagging every loss red.
 */
function CopyHash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; the hash is still
      // selectable text, so there's nothing further to do here.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-md border border-border-default px-2 py-1 text-[11px] text-text-muted hover:border-accent-primary hover:text-text-primary"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function RoundHistory({
  rounds,
  commitment,
}: {
  rounds: CoinflipRound[];
  commitment: SeedCommitmentView | null;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-5">
      <h2 className="text-xs uppercase tracking-wider text-text-muted">Your rounds</h2>

      {rounds.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">No rounds yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rounds.map((round) => (
            <li
              key={round.id}
              className="flex items-center justify-between rounded-md border border-border-default px-3 py-2 text-sm"
            >
              <span className="flex items-baseline gap-2">
                <span className="lowercase first-letter:uppercase text-text-muted">
                  {round.result}
                </span>
                <span className="font-mono text-[11px] text-text-muted/70">
                  #{round.nonce}
                </span>
              </span>
              <span className="font-mono text-text-muted">
                {formatMicroUsd(round.wagerMicroUsd)}
              </span>
              <span className={`font-mono ${round.won ? "text-state-success" : "text-text-muted"}`}>
                {round.won
                  ? `+${formatMicroUsd(round.payoutMicroUsd)}`
                  : `-${formatMicroUsd(round.wagerMicroUsd)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {commitment ? (
        <div className="mt-5 border-t border-border-default pt-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">Seed commitment</p>
          <div className="mt-1 flex items-start gap-2">
            <p className="break-all font-mono text-xs text-text-muted">
              {commitment.serverSeedHash}
            </p>
            <CopyHash value={commitment.serverSeedHash} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            Published before any of these rounds -- the nonce next to each
            result above ties it to this exact commitment. Rotate your seed
            in Settings to reveal it and check every round it covered.
          </p>
        </div>
      ) : null}
    </section>
  );
}
