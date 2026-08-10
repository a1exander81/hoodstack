"use client";

/**
 * Ambient login background: neon chips falling through the dark, cut by
 * meteor streaks.
 *
 * Motion is the point here — chips tumble at different speeds and sizes to
 * fake depth, and the meteors fire on long staggered intervals so the screen
 * never feels like a repeating loop. A faint horizon and floor grid sit
 * underneath so the falling reads as happening *in* a space rather than
 * against a flat panel.
 *
 * Colour discipline per ui-context.md: chip green is the lead, with amber and
 * a single violet as secondary chip tones. No magenta/cyan gradients.
 *
 * Purely decorative: aria-hidden, and all motion stops under
 * prefers-reduced-motion.
 */

type Chip = {
  x: number;
  r: number;
  tone: string;
  dur: number;
  delay: number;
  spin: number;
};

// Spread across x, varied size and speed. Smaller + slower = further away.
const CHIPS: Chip[] = [
  { x: 118, r: 26, tone: "#22C55E", dur: 13, delay: 0, spin: 340 },
  { x: 268, r: 14, tone: "#8B919A", dur: 19, delay: -7, spin: -260 },
  { x: 402, r: 34, tone: "#E8B931", dur: 11, delay: -4, spin: 300 },
  { x: 560, r: 11, tone: "#22C55E", dur: 23, delay: -14, spin: -400 },
  { x: 688, r: 22, tone: "#7C5CE0", dur: 16, delay: -2, spin: 280 },
  { x: 842, r: 30, tone: "#22C55E", dur: 12, delay: -9, spin: -320 },
  { x: 980, r: 16, tone: "#E8B931", dur: 20, delay: -5, spin: 360 },
  { x: 1108, r: 24, tone: "#22C55E", dur: 15, delay: -11, spin: -300 },
];

// Meteors travel top-right to bottom-left, against the chips' vertical fall.
const METEORS = [
  { x: 1180, y: -120, dur: 3.2, delay: 0, len: 210, w: 2.4 },
  { x: 880, y: -200, dur: 4.6, delay: -1.8, len: 150, w: 1.8 },
  { x: 1320, y: -60, dur: 2.7, delay: -3.4, len: 260, w: 3 },
  { x: 640, y: -160, dur: 5.4, delay: -2.2, len: 130, w: 1.5 },
  { x: 1040, y: -260, dur: 3.9, delay: -4.8, len: 190, w: 2.1 },
];

export function LoginBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0B0E11]"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hsFloor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.26" />
          </linearGradient>

          {/* Meteor trail: bright at the head, gone by the tail. */}
          <linearGradient id="hsTrail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0" />
            <stop offset="70%" stopColor="#5BE58A" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#D6FFE4" stopOpacity="0.95" />
          </linearGradient>

          <radialGradient id="hsVignette" cx="50%" cy="46%" r="74%">
            <stop offset="0%" stopColor="#0B0E11" stopOpacity="0.28" />
            <stop offset="55%" stopColor="#0B0E11" stopOpacity="0.74" />
            <stop offset="100%" stopColor="#0B0E11" stopOpacity="0.97" />
          </radialGradient>

          {/* Neon bloom. Kept to one shared filter — per-element filters get
              expensive fast on lower-end mobile. */}
          <filter id="hsGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="hsSoft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>

          <clipPath id="hsFloorClip">
            <rect x="0" y="470" width="1200" height="330" />
          </clipPath>
        </defs>

        <rect width="1200" height="800" fill="#0B0E11" />

        {/* Horizon + floor: depth cue only, deliberately dim. */}
        <line x1="0" y1="470" x2="1200" y2="470" stroke="#22C55E" strokeOpacity="0.3" strokeWidth="1" />
        <line
          x1="0"
          y1="470"
          x2="1200"
          y2="470"
          stroke="#22C55E"
          strokeOpacity="0.42"
          strokeWidth="3"
          filter="url(#hsSoft)"
        />
        <g clipPath="url(#hsFloorClip)" stroke="url(#hsFloor)" strokeWidth="1" strokeOpacity="0.7">
          <line x1="600" y1="470" x2="-420" y2="800" />
          <line x1="600" y1="470" x2="-40" y2="800" />
          <line x1="600" y1="470" x2="248" y2="800" />
          <line x1="600" y1="470" x2="452" y2="800" />
          <line x1="600" y1="470" x2="600" y2="800" />
          <line x1="600" y1="470" x2="748" y2="800" />
          <line x1="600" y1="470" x2="952" y2="800" />
          <line x1="600" y1="470" x2="1240" y2="800" />
          <line x1="600" y1="470" x2="1620" y2="800" />
          <line x1="0" y1="498" x2="1200" y2="498" strokeOpacity="0.45" />
          <line x1="0" y1="542" x2="1200" y2="542" strokeOpacity="0.55" />
          <line x1="0" y1="606" x2="1200" y2="606" strokeOpacity="0.7" />
          <line x1="0" y1="694" x2="1200" y2="694" strokeOpacity="0.85" />
        </g>

        {/* Meteor shower */}
        <g filter="url(#hsGlow)">
          {METEORS.map((m, i) => (
            <g
              key={i}
              className="hs-meteor"
              style={{
                animationDuration: `${m.dur}s`,
                animationDelay: `${m.delay}s`,
                ["--hs-x" as string]: `${m.x}px`,
                ["--hs-y" as string]: `${m.y}px`,
              }}
            >
              <line
                x1={0}
                y1={0}
                x2={m.len}
                y2={-m.len * 0.52}
                stroke="url(#hsTrail)"
                strokeWidth={m.w}
                strokeLinecap="round"
              />
              <circle r={m.w * 0.9} fill="#EAFFF1" />
            </g>
          ))}
        </g>

        {/* Falling chips */}
        <g filter="url(#hsGlow)">
          {CHIPS.map((c, i) => (
            <g
              key={i}
              className="hs-fall"
              style={{
                animationDuration: `${c.dur}s`,
                animationDelay: `${c.delay}s`,
                ["--hs-cx" as string]: `${c.x}px`,
                ["--hs-spin" as string]: `${c.spin}deg`,
              }}
            >
              <ChipMark r={c.r} tone={c.tone} />
            </g>
          ))}
        </g>

        <rect width="1200" height="800" fill="url(#hsVignette)" />
      </svg>

      <style>{`
        .hs-fall {
          animation-name: hs-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          transform-box: view-box;
        }
        @keyframes hs-fall {
          0%   { transform: translate(var(--hs-cx), -120px) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translate(var(--hs-cx), 900px) rotate(var(--hs-spin)); opacity: 0; }
        }

        .hs-meteor {
          animation-name: hs-meteor;
          animation-timing-function: cubic-bezier(.4,0,.85,.4);
          animation-iteration-count: infinite;
          transform-box: view-box;
          opacity: 0;
        }
        @keyframes hs-meteor {
          0%   { transform: translate(var(--hs-x), var(--hs-y)); opacity: 0; }
          6%   { opacity: 1; }
          46%  { opacity: 1; }
          58%  { transform: translate(calc(var(--hs-x) - 900px), calc(var(--hs-y) + 830px)); opacity: 0; }
          100% { transform: translate(calc(var(--hs-x) - 900px), calc(var(--hs-y) + 830px)); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hs-fall, .hs-meteor { animation: none; }
          .hs-meteor { opacity: 0; }
          .hs-fall { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

/** A single chip: body, inner dashed ring, and six edge notches. */
function ChipMark({ r, tone }: { r: number; tone: string }) {
  const notches = [0, 60, 120, 180, 240, 300];
  return (
    <g opacity="0.62">
      <circle r={r} fill="#0F1419" stroke={tone} strokeOpacity="0.9" strokeWidth={r * 0.1} />
      <circle
        r={r * 0.58}
        fill="none"
        stroke={tone}
        strokeOpacity="0.45"
        strokeWidth={r * 0.07}
        strokeDasharray={`${r * 0.3} ${r * 0.22}`}
      />
      {notches.map((deg) => (
        <rect
          key={deg}
          x={-r * 0.11}
          y={-r}
          width={r * 0.22}
          height={r * 0.28}
          fill={tone}
          fillOpacity="0.85"
          transform={`rotate(${deg})`}
        />
      ))}
    </g>
  );
}
