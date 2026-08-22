"use client";

import { useEffect, useState } from "react";
import type { CrashedPayload, RoundStateSnapshot } from "./types";

function formatMultiplierBps(bps: number): string {
  return `${(bps / 10_000).toFixed(2)}x`;
}

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
  justCrashed,
}: {
  roundState: RoundStateSnapshot;
  liveMultiplierBps: number;
  justCrashed: CrashedPayload | null;
}) {
  if (justCrashed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-6xl font-bold text-state-error">
          {formatMultiplierBps(justCrashed.crashMultiplierBps)}
        </p>
        <p className="text-sm text-text-muted">Crashed</p>
      </div>
    );
  }

  if (roundState.phase === "BETTING") {
    return (
      <BettingCountdown
        bettingOpenedAt={roundState.bettingOpenedAt}
        bettingWindowMs={roundState.bettingWindowMs}
        serverSeedHash={roundState.serverSeedHash}
      />
    );
  }

  if (roundState.phase === "RUNNING") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-6xl font-bold text-accent-primary">
          {formatMultiplierBps(liveMultiplierBps)}
        </p>
        <p className="text-sm text-text-muted">Rising&hellip;</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-mono text-6xl font-bold text-text-muted">&mdash;</p>
      <p className="text-sm text-text-muted">Waiting for next round&hellip;</p>
    </div>
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
      <p className="font-mono text-6xl font-bold text-text-primary">{seconds}s</p>
      <p className="text-sm text-text-muted">Betting open</p>
      <p className="mt-2 max-w-xs break-all text-center font-mono text-[11px] text-text-muted/70">
        {serverSeedHash}
      </p>
    </div>
  );
}
