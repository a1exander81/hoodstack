import type { CrashHistoryEntry } from "./types";

/**
 * A low crash point is a normal outcome (the house edge showing up as
 * designed), not an error -- state-error is reserved for things that
 * actually went wrong, same convention coinflip/round-history.tsx follows
 * for a losing round. Color here is purely an intensity cue: muted for a
 * quick bust, the accent for anything that ran a while.
 */
function chipTone(crashMultiplierBps: number): string {
  if (crashMultiplierBps < 15_000) return "text-text-muted"; // < 1.50x
  if (crashMultiplierBps < 30_000) return "text-text-primary"; // < 3.00x
  return "text-accent-primary";
}

export function RoundHistory({ history }: { history: CrashHistoryEntry[] }) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-5">
      <h2 className="text-xs uppercase tracking-wider text-text-muted">Recent rounds</h2>

      {history.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">No rounds yet.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {history.map((entry) => (
            <li
              key={entry.crashRoundId}
              className={`rounded-md border border-border-default px-3 py-1 font-mono text-sm ${chipTone(
                entry.crashMultiplierBps,
              )}`}
            >
              {(entry.crashMultiplierBps / 10_000).toFixed(2)}x
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
