"use client";

import { useEffect, useRef } from "react";
import type { CrashedPayload, RoundStateSnapshot } from "./types";

const ROCKET_SRC = "/crash/rocket.png";

// Deliberate exception to ui-context.md's documented "avoid the neon/space
// aesthetic, Lucide stroke icons only" default -- recorded there as a
// Crash-specific decision, not a silent drift from the standard. Canvas
// fillStyle/strokeStyle take raw color strings regardless of the Tailwind
// token system (code-standards.md's "no hardcoded hex" rule targets
// className strings, which this file has none of), so this palette lives
// as named constants rather than Tailwind classes.
const SPACE_TOP = "#05070d";
const SPACE_BOTTOM = "#0d1420";
const STAR_RGB = "255,255,255";
const TRAIL_RGB = "34,197,94"; // accent-primary, as an rgba() base
const FLAME_INNER = "#FFE9A8";
const PLANET_COLORS = ["#5B6EE1", "#C9764B", "#8B5CF6"];

const STAR_COUNT = 60;
const TRAIL_MAX_POINTS = 70;
const ROCKET_SIZE_PX = 34;

// Bounded ease-out: the rocket approaches but never reaches the top of its
// travel band, no matter how long a round runs -- a real round has been
// observed live running past 100x (see progress-tracker.md). Position is
// driven by real elapsed time, NOT multiplierBps, which grows
// exponentially and would send the rocket off-screen within a few seconds
// of a merely-average round. Once the rocket's own on-screen climb has
// mostly flattened out, the starfield/planet parallax scroll (below) keeps
// carrying the sense of continued flight for a long round instead.
const CLIMB_TIME_CONSTANT_MS = 6_000;
function climbProgress(elapsedMs: number): number {
  return 1 - Math.exp(-elapsedMs / CLIMB_TIME_CONSTANT_MS);
}

// Caps how far the display extrapolates a server tick's elapsedMs forward
// using the browser's own clock before a fresher tick arrives. round:tick
// fires every 100ms under normal conditions; capping well beyond that
// means a stalled/disconnected socket freezes the rocket in place rather
// than letting it run away on a stale reading.
const MAX_EXTRAPOLATION_MS = 400;

type Star = { x: number; y: number; r: number; phase: number; speed: number };
type Planet = { x: number; y: number; r: number; color: string };
type Pose = { rx: number; ry: number; sway: number };

/**
 * Purely decorative canvas layer behind MultiplierDisplay's text.
 *
 * The heavy setup (canvas sizing, starfield/planet generation, the rocket
 * sprite, the requestAnimationFrame loop) runs ONCE on mount, not on every
 * prop change -- round:tick fires 10/sec, and tearing down/rebuilding a
 * canvas animation at that rate would be wasteful and visibly janky. Live
 * values (phase, elapsedMs, justCrashed) reach the running loop through
 * refs, updated by a second, cheap effect that never touches the canvas or
 * the loop itself. Server ticks are extrapolated forward using the
 * browser's own clock between ticks for smooth motion, since 10 discrete
 * steps/sec looks like teleporting for a moving sprite (the plain numeric
 * multiplier elsewhere renders off the raw tick value directly -- text
 * doesn't have this problem, motion does).
 */
export function RocketScene({
  phase,
  elapsedMs,
  justCrashed,
}: {
  phase: RoundStateSnapshot["phase"];
  elapsedMs: number;
  justCrashed: CrashedPayload | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const justCrashedRef = useRef(justCrashed);
  const tickRef = useRef({ serverElapsedMs: elapsedMs, capturedAt: performance.now() });
  const frozenRef = useRef<Pose | null>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const reduceMotionRef = useRef(false);
  const redrawStaticRef = useRef<(() => void) | null>(null);

  // Plain assignment during render, not an effect -- the standard pattern
  // for a ref an animation loop reads every frame without depending on it.
  phaseRef.current = phase;
  justCrashedRef.current = justCrashed;

  // A new round starting is the one unambiguous point to drop the trail
  // and any frozen crash pose from the PREVIOUS round -- mirrors
  // crash-game.tsx's own reasoning for resetting myBet on
  // round:betting_open.
  useEffect(() => {
    if (phase === "BETTING") {
      trailRef.current = [];
      frozenRef.current = null;
    }
  }, [phase]);

  // Cheap: sync the latest server tick for the rAF loop to extrapolate
  // from, and (reduced-motion only) redraw a single static frame.
  useEffect(() => {
    tickRef.current = { serverElapsedMs: elapsedMs, capturedAt: performance.now() };
    if (reduceMotionRef.current) redrawStaticRef.current?.();
  }, [elapsedMs, phase, justCrashed]);

  // Heavy setup -- runs once for the component's lifetime.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.3 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.0015 + 0.0006,
    }));
    const planets: Planet[] = [
      { x: 0.84, y: 0.16, r: 20, color: PLANET_COLORS[0] },
      { x: 0.12, y: 0.7, r: 13, color: PLANET_COLORS[1] },
      { x: 0.64, y: 0.86, r: 8, color: PLANET_COLORS[2] },
    ];

    // img.complete becomes true for a BROKEN image too (per spec), which
    // would let drawImage throw inside drawFrame -- and since drawFrame
    // isn't wrapped in try/catch, one throw would silently kill the rest of
    // that frame's drawing (and, in the animated path, everything after
    // it) rather than just leaving the rocket undrawn. Tracked explicitly
    // via onload instead, left false on error.
    let rocketReady = false;
    const rocketImg = new Image();
    rocketImg.onload = () => {
      rocketReady = true;
      redrawStaticRef.current?.();
    };
    rocketImg.onerror = () => {
      console.error("[rocket-scene] failed to load rocket sprite:", ROCKET_SRC);
    };
    rocketImg.src = ROCKET_SRC;

    let width = 0;
    let height = 0;
    let backgroundGradient: CanvasGradient | null = null;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Depends only on height -- rebuilding it every frame (60/sec in the
      // animated path) for a value that only changes on resize is wasted
      // work.
      backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, SPACE_TOP);
      backgroundGradient.addColorStop(1, SPACE_BOTTOM);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    function currentElapsedMs(): number {
      const { serverElapsedMs, capturedAt } = tickRef.current;
      const drift = Math.min(performance.now() - capturedAt, MAX_EXTRAPOLATION_MS);
      return serverElapsedMs + drift;
    }

    function computePose(now: number): Pose {
      const el = currentElapsedMs();
      const running = phaseRef.current === "RUNNING";
      const progress = running ? climbProgress(el) : 0;
      const sway = running ? Math.sin(now * 0.0009) * 0.06 : 0;
      // Keeps the whole flight band in the upper portion of the panel, well
      // clear of the multiplier text's vertical center -- MultiplierDisplay
      // renders that text flex-centered over this same canvas.
      const padY = height * 0.82;
      const topY = height * 0.06;
      return {
        rx: width * 0.5 + sway * width,
        ry: padY - (padY - topY) * progress,
        sway,
      };
    }

    function drawFrame(now: number, scrollBasis: number) {
      ctx!.fillStyle = backgroundGradient!;
      ctx!.fillRect(0, 0, width, height);

      const reduceMotion = reduceMotionRef.current;
      const scrollPx = reduceMotion ? 0 : (scrollBasis * 0.006) % height;

      for (const star of stars) {
        const twinkle = reduceMotion
          ? 0.7
          : 0.4 + 0.6 * Math.abs(Math.sin(now * star.speed + star.phase));
        const sy = ((((star.y * height + scrollPx * 0.4) % height) + height) % height);
        ctx!.fillStyle = `rgba(${STAR_RGB},${twinkle.toFixed(2)})`;
        ctx!.beginPath();
        ctx!.arc(star.x * width, sy, star.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      for (const planet of planets) {
        const py = ((((planet.y * height + scrollPx * 0.15) % height) + height) % height);
        const grad = ctx!.createRadialGradient(
          planet.x * width - planet.r * 0.3,
          py - planet.r * 0.3,
          planet.r * 0.1,
          planet.x * width,
          py,
          planet.r,
        );
        grad.addColorStop(0, planet.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(planet.x * width, py, planet.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      const running = phaseRef.current === "RUNNING" && !justCrashedRef.current;

      let pose: Pose;
      if (justCrashedRef.current) {
        if (!frozenRef.current) frozenRef.current = computePose(now);
        pose = frozenRef.current;
      } else {
        pose = computePose(now);
      }

      if (running) {
        trailRef.current.push({ x: pose.rx, y: pose.ry });
        if (trailRef.current.length > TRAIL_MAX_POINTS) trailRef.current.shift();
      }
      const trail = trailRef.current;
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.5;
        ctx!.strokeStyle = `rgba(${TRAIL_RGB},${alpha.toFixed(2)})`;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx!.lineTo(trail[i].x, trail[i].y);
        ctx!.stroke();
      }

      if (running) {
        const flicker = reduceMotion ? 1 : 0.7 + Math.random() * 0.3;
        const flameLen = 14 * flicker;
        const fg = ctx!.createLinearGradient(pose.rx, pose.ry + 16, pose.rx, pose.ry + 16 + flameLen);
        fg.addColorStop(0, FLAME_INNER);
        fg.addColorStop(1, "rgba(255,106,43,0)");
        ctx!.fillStyle = fg;
        ctx!.beginPath();
        ctx!.moveTo(pose.rx - 5, pose.ry + 16);
        ctx!.lineTo(pose.rx + 5, pose.ry + 16);
        ctx!.lineTo(pose.rx, pose.ry + 16 + flameLen);
        ctx!.closePath();
        ctx!.fill();
      }

      if (rocketReady) {
        ctx!.save();
        ctx!.translate(pose.rx, pose.ry);
        ctx!.rotate(pose.sway * 2);
        ctx!.drawImage(
          rocketImg,
          -ROCKET_SIZE_PX / 2,
          -ROCKET_SIZE_PX / 2,
          ROCKET_SIZE_PX,
          ROCKET_SIZE_PX,
        );
        ctx!.restore();
      }
    }

    redrawStaticRef.current = () => drawFrame(performance.now(), 0);

    // A plain mount-time matchMedia check misses a mid-session OS-level
    // toggle -- the effect only runs once, so nothing would ever re-read
    // it. A `change` listener keeps reduceMotionRef (and which mode is
    // actually running) in sync for the rest of this component's life.
    let rafId: number | null = null;
    function startLoop() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(function loop(now) {
        drawFrame(now, now);
        rafId = requestAnimationFrame(loop);
      });
    }
    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
    function applyMotionPreference() {
      if (reduceMotionRef.current) {
        stopLoop();
        drawFrame(performance.now(), 0);
      } else {
        startLoop();
      }
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = motionQuery.matches;
    applyMotionPreference();

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reduceMotionRef.current = event.matches;
      applyMotionPreference();
    };
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      stopLoop();
      motionQuery.removeEventListener("change", handleMotionChange);
      resizeObserver.disconnect();
      redrawStaticRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
