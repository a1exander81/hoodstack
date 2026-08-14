"use client";

import { formatMicroUsd } from "@/lib/format";
import type { CoinSide } from "./dev-stubs";

export type CoinflipRound = {
  id: string;
  side: CoinSide;
  result: CoinSide;
  wagerMicroUsd: bigint;
  payoutMicroUsd: bigint;
};

export function RoundHistory({ rounds }: { rounds: CoinflipRound[] }) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-5">
      <h2 className="text-xs uppercase tracking-wider text-text-muted">Your rounds</h2>

      {rounds.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">No rounds yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rounds.map((round) => {
            const won = round.side === round.result;
            return (
              <li
                key={round.id}
                className="flex items-center justify-between rounded-md border border-border-default px-3 py-2 text-sm"
              >
                <span className="capitalize text-text-muted">{round.result}</span>
                <span className="font-mono text-text-muted">
                  {formatMicroUsd(round.wagerMicroUsd)}
                </span>
                <span
                  className={`font-mono ${won ? "text-state-success" : "text-state-error"}`}
                >
                  {won ? `+${formatMicroUsd(round.payoutMicroUsd)}` : "\u2014"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        Amounts shown are what a round would pay. No balance has moved.
      </p>
    </section>
  );
}
