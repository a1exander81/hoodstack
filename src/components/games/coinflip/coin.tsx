"use client";

import { useEffect, useRef, useState } from "react";
import type { CoinSide } from "@services/games";

const FLIP_MS = 1400;
const FULL_SPINS = 5;

/**
 * The coin. A CSS 3D transform rather than a canvas: a two-sided flip
 * is a rotation, and this gets reduced-motion handling essentially for
 * free. Crash is where a real canvas earns itself.
 *
 * Rotation accumulates monotonically instead of resetting to 0/180, so
 * consecutive flips always spin forward rather than unwinding.
 *
 * The side it lands on is decided SERVER-side before this ever animates --
 * the animation displays an outcome, it does not produce one.
 */
export function Coin({
  side,
  flipping,
  onSettled,
}: {
  side: CoinSide;
  flipping: boolean;
  onSettled: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (!flipping) return;

    setRotation((current) => {
      const target = side === "HEADS" ? 0 : 180;
      const spins = reducedMotion ? 0 : FULL_SPINS * 360;
      const base = Math.ceil((current + spins) / 360) * 360;
      return base + target;
    });

    const duration = reducedMotion ? 0 : FLIP_MS;
    const timer = window.setTimeout(() => settledRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [flipping, side, reducedMotion]);

  const faceBase =
    "absolute inset-0 flex items-center justify-center rounded-full border-4 text-2xl font-bold uppercase tracking-widest [backface-visibility:hidden]";

  return (
    <div className="flex h-64 w-64 items-center justify-center [perspective:1200px]">
      <div
        className="relative h-48 w-48 [transform-style:preserve-3d]"
        style={{
          transform: `rotateY(${rotation}deg)`,
          transition: reducedMotion
            ? "none"
            : `transform ${FLIP_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`,
        }}
        aria-live="polite"
        aria-label={flipping ? "Flipping" : `Result: ${side.toLowerCase()}`}
      >
        <div className={`${faceBase} border-accent-primary bg-bg-surface text-accent-primary`}>
          Heads
        </div>
        <div
          className={`${faceBase} border-text-muted bg-bg-surface text-text-muted`}
          style={{ transform: "rotateY(180deg)" }}
        >
          Tails
        </div>
      </div>
    </div>
  );
}
