"use client";

/**
 * Ambient login background.
 *
 * Reads as a casino floor receding into the dark: a perspective grid,
 * distant light columns, and chips drifting up through them. Deliberately
 * NOT the neon-crypto look — per ui-context.md, magenta/cyan glow and
 * DeFi/NFT signalling undercut trust for a first-time, non-crypto player.
 * The only saturated colour is chip green (--accent-primary); everything
 * else is near-black with restrained warm accents on the chips themselves.
 *
 * Purely decorative: aria-hidden, and all motion stops under
 * prefers-reduced-motion.
 */
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
          {/* Floor fades out toward the horizon so the grid never competes
              with the card sitting on top of it. */}
          <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0" />
            <stop offset="35%" stopColor="#22C55E" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.30" />
          </linearGradient>

          <linearGradient id="columnGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0" />
            <stop offset="60%" stopColor="#22C55E" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
          </linearGradient>

          {/* Vignette keeps the centre dark enough for text contrast. */}
          <radialGradient id="vignette" cx="50%" cy="46%" r="72%">
            <stop offset="0%" stopColor="#0B0E11" stopOpacity="0.20" />
            <stop offset="55%" stopColor="#0B0E11" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#0B0E11" stopOpacity="0.96" />
          </radialGradient>

          <filter id="soften" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>

          <clipPath id="floorClip">
            <rect x="0" y="430" width="1200" height="370" />
          </clipPath>
        </defs>

        <rect width="1200" height="800" fill="#0B0E11" />

        {/* Distant light columns — suggestion of a room, not a skyline. */}
        <g opacity="0.55">
          <rect x="120" y="180" width="52" height="250" fill="url(#columnGlow)" />
          <rect x="336" y="230" width="34" height="200" fill="url(#columnGlow)" />
          <rect x="830" y="205" width="44" height="225" fill="url(#columnGlow)" />
          <rect x="1024" y="165" width="58" height="265" fill="url(#columnGlow)" />
        </g>

        {/* Horizon line — the single brightest element, anchoring depth. */}
        <line
          x1="0"
          y1="430"
          x2="1200"
          y2="430"
          stroke="#22C55E"
          strokeOpacity="0.34"
          strokeWidth="1"
        />
        <line
          x1="0"
          y1="430"
          x2="1200"
          y2="430"
          stroke="#22C55E"
          strokeOpacity="0.5"
          strokeWidth="3"
          filter="url(#soften)"
        />

        {/* Perspective floor. Verticals converge on the vanishing point at
            (600, 430); horizontals are spaced non-linearly to fake depth. */}
        <g clipPath="url(#floorClip)" stroke="url(#floorFade)" strokeWidth="1">
          <line x1="600" y1="430" x2="-560" y2="800" />
          <line x1="600" y1="430" x2="-180" y2="800" />
          <line x1="600" y1="430" x2="105" y2="800" />
          <line x1="600" y1="430" x2="310" y2="800" />
          <line x1="600" y1="430" x2="455" y2="800" />
          <line x1="600" y1="430" x2="600" y2="800" />
          <line x1="600" y1="430" x2="745" y2="800" />
          <line x1="600" y1="430" x2="890" y2="800" />
          <line x1="600" y1="430" x2="1095" y2="800" />
          <line x1="600" y1="430" x2="1380" y2="800" />
          <line x1="600" y1="430" x2="1760" y2="800" />

          <line x1="0" y1="452" x2="1200" y2="452" strokeOpacity="0.5" />
          <line x1="0" y1="482" x2="1200" y2="482" strokeOpacity="0.6" />
          <line x1="0" y1="524" x2="1200" y2="524" strokeOpacity="0.7" />
          <line x1="0" y1="582" x2="1200" y2="582" strokeOpacity="0.8" />
          <line x1="0" y1="658" x2="1200" y2="658" strokeOpacity="0.9" />
          <line x1="0" y1="756" x2="1200" y2="756" />
        </g>

        {/* Chips drifting up through the room. Edge notches are the real
            detail of a casino chip — the thing that makes it read as a chip
            rather than a coin. */}
        <g className="hs-drift hs-drift-a">
          <Chip x={228} y={560} r={30} tone="#22C55E" />
        </g>
        <g className="hs-drift hs-drift-b">
          <Chip x={962} y={620} r={22} tone="#E8B931" />
        </g>
        <g className="hs-drift hs-drift-c">
          <Chip x={772} y={506} r={15} tone="#8B919A" />
        </g>
        <g className="hs-drift hs-drift-d">
          <Chip x={392} y={478} r={11} tone="#22C55E" />
        </g>

        <rect width="1200" height="800" fill="url(#vignette)" />
      </svg>

      <style>{`
        .hs-drift { animation: hs-float 15s ease-in-out infinite; }
        .hs-drift-b { animation-duration: 19s; animation-delay: -4s; }
        .hs-drift-c { animation-duration: 23s; animation-delay: -9s; }
        .hs-drift-d { animation-duration: 27s; animation-delay: -2s; }

        @keyframes hs-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-26px) rotate(6deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hs-drift { animation: none; }
        }
      `}</style>
    </div>
  );
}

/** A single chip: body, inner ring, and six edge notches. */
function Chip({
  x,
  y,
  r,
  tone,
}: {
  x: number;
  y: number;
  r: number;
  tone: string;
}) {
  const notches = [0, 60, 120, 180, 240, 300];
  return (
    <g transform={`translate(${x} ${y})`} opacity="0.5">
      <circle r={r} fill="#161A20" stroke={tone} strokeOpacity="0.85" strokeWidth={r * 0.09} />
      <circle
        r={r * 0.6}
        fill="none"
        stroke={tone}
        strokeOpacity="0.4"
        strokeWidth={r * 0.06}
        strokeDasharray={`${r * 0.3} ${r * 0.22}`}
      />
      {notches.map((deg) => (
        <rect
          key={deg}
          x={-r * 0.1}
          y={-r}
          width={r * 0.2}
          height={r * 0.26}
          fill={tone}
          fillOpacity="0.75"
          transform={`rotate(${deg})`}
        />
      ))}
    </g>
  );
}
