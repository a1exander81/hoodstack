"use client";

import { useEffect, useState } from "react";
import { RocketScene } from "./rocket-scene";
import type { CrashedPayload, RoundStateSnapshot } from "./types";

function formatMultiplierBps(bps: number): string {
  return `${(bps / 10_000).toFixed(2)}x`;
}

// Shared rather than repeated across the four number variants below --
// black, neutral, not a new palette color -- keeps the live multiplier
// legible over the starfield now behind it.
const BIG_NUMBER_CLASS =
  "font-mono text-6xl font-bold [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]";

/** Presentational-only ticking countdown; touches nothing but the display. */
function useCountdownSeconds(bettingOpenedAt: number, bettingWindowMs: number): number {
  const [remainingMs, setRemainingMs] = useState(
    bettingOpenedAt + bettingWindowMs - Date.now(),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemainingMs(bettingOpenedAt + bettingWindowMs - Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [bettingOpenedAt, bettingWindowMs]);

  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function MultiplierDisplay({
  roundState,
  liveMultiplierBps,
  liveElapsedMs,
  justCrashed,
}: {
  roundState: RoundStateSnapshot;
  liveMultiplierBps: number;
  liveElapsedMs: number;
  justCrashed: CrashedPayload | null;
}) {
  return (
    <>
      <RocketScene phase={roundState.phase} elapsedMs={liveElapsedMs} justCrashed={justCrashed} />
      {/* text-shadow (black, neutral -- not a new palette color) keeps the
          live multiplier legible over the starfield now behind it */}
      <div className="relative z-10">
        {justCrashed ? (
          <div className="flex flex-col items-center gap-2">
            <p className={`${BIG_NUMBER_CLASS} text-state-error`}>
              {formatMultiplierBps(justCrashed.crashMultiplierBps)}
            </p>
            <p className="text-sm text-text-muted">Crashed</p>
          </div>
        ) : roundState.phase === "BETTING" ? (
          <BettingCountdown
            bettingOpenedAt={roundState.bettingOpenedAt}
            bettingWindowMs={roundState.bettingWindowMs}
            serverSeedHash={roundState.serverSeedHash}
          />
        ) : roundState.phase === "RUNNING" ? (
          <div className="flex flex-col items-center gap-2">
            <p className={`${BIG_NUMBER_CLASS} text-accent-primary`}>
              {formatMultiplierBps(liveMultiplierBps)}
            </p>
            <p className="text-sm text-text-muted">Rising&hellip;</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className={`${BIG_NUMBER_CLASS} text-text-muted`}>&mdash;</p>
            <p className="text-sm text-text-muted">Waiting for next round&hellip;</p>
          </div>
        )}
      </div>
    </>
  );
}

function BettingCountdown({
  bettingOpenedAt,
  bettingWindowMs,
  serverSeedHash,
}: {
  bettingOpenedAt: number;
  bettingWindowMs: number;
  serverSeedHash: string;
}) {
  const seconds = useCountdownSeconds(bettingOpenedAt, bettingWindowMs);

  return (
    <div className="flex flex-col items-center gap-2">
      <p className={`${BIG_NUMBER_CLASS} text-text-primary`}>{seconds}s</p>
      <p className="text-sm text-text-muted">Betting open</p>
      <p className="mt-2 max-w-xs break-all text-center font-mono text-[11px] text-text-muted/70">
        {serverSeedHash}
      </p>
    </div>
  );
}
