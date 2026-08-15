"use client";

import { formatMicroUsd } from "@/lib/format";
import type { CoinflipRound, SeedCommitmentView } from "./types";

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
              <span className="lowercase first-letter:uppercase text-text-muted">
                {round.result}
              </span>
              <span className="font-mono text-text-muted">
                {formatMicroUsd(round.wagerMicroUsd)}
              </span>
              <span
                className={`font-mono ${round.won ? "text-state-success" : "text-state-error"}`}
              >
                {round.won ? `+${formatMicroUsd(round.payoutMicroUsd)}` : "\u2014"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {commitment ? (
        <div className="mt-5 border-t border-border-default pt-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">Seed commitment</p>
          <p className="mt-1 break-all font-mono text-xs text-text-muted">
            {commitment.serverSeedHash}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            Published before any of these rounds. Rotate your seed in Settings to
            reveal it and check every round it covered.
          </p>
        </div>
      ) : null}
    </section>
  );
}
