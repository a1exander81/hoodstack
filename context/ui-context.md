# UI Context

## Theme

Dark, casino-appropriate, but deliberately restrained. Avoid the neon
"degen crypto" aesthetic (magenta/cyan gradients, glitch effects,
oversized countdown timers) — it reads as untrustworthy to a
first-time, non-crypto player and works against the "this is just a
normal app" narrative. Lean toward mainstream betting/fintech visual
language instead: near-black surfaces, one confident accent color,
real typographic hierarchy, and enough spacing that the UI doesn't
feel like a pressure page.

**Deliberate exception: Crash's multiplier display.** `src/components/
games/crash/rocket-scene.tsx` renders an animated space scene (stars,
parallax planets, a rocket sprite with flame and a fading trajectory
trail) behind the live multiplier number — a literal reading of
"Crash," the game's own name and mechanic, not a generic decoration.
Chosen deliberately as a scoped exception rather than a drift from
the restrained default above: it lives in exactly one component, on
the one screen where the round is actually live, and does not touch
the surrounding chrome (bet panel, balance, nav all stay on the
standard palette). Its own small color palette (deep-space gradient,
star white, a few planet accent hues, flame orange/yellow) is defined
as named constants inside that file rather than as Tailwind tokens —
canvas `fillStyle`/`strokeStyle` take raw color strings regardless of
the token system, so `code-standards.md`'s "no hardcoded hex in
classNames" rule doesn't apply to it, and adding one-off Tailwind
tokens for colors used nowhere else would be worse, not better. The
rocket sprite is a licensed/user-provided PNG in `public/crash/
rocket.png` (referenced by URL, not bundled through the JS build),
not a Lucide icon — the Icons section's "Lucide stroke-based only"
rule below is about UI chrome (buttons, inline icons), not this one
illustrated centerpiece.

## Colors

Starting tokens — refine during the actual design pass.

| Role | Tailwind token | Value |
| --- | --- | --- |
| Page background | `bg-base` | `#0B0E11` |
| Surface | `bg-surface` | `#161A20` |
| Primary text | `text-primary` | `#F2F3F5` |
| Muted text | `text-muted` | `#8B919A` |
| Primary accent ("chip green") | `accent-primary` | `#22C55E` |
| Border | `border-default` | `#262B33` |
| Error | `state-error` | `#EF4444` |
| Success | `state-success` | `#22C55E` |

These are `theme.extend.colors` keys in `tailwind.config.ts`, not CSS
custom properties. Apply them with the normal utility prefixes —
`bg-bg-surface`, `text-text-muted`, `border-border-default`. This
table and `tailwind.config.ts` are the same source of truth in two
places and have drifted once already; change both together.

`state-success` is deliberately identical to `accent-primary`. Keep
them separate anyway so a later accent change doesn't silently
recolor every win state.

## Typography

| Role | Font | Variable |
| --- | --- | --- |
| UI text | Geist Sans | `--font-sans` |
| Code/mono, seed hashes | Geist Mono | `--font-mono` |

## Border Radius

| Context | Class |
| --- | --- |
| Inline / small UI | `rounded-md` |
| Cards / panels | `rounded-xl` |
| Modals / overlays | `rounded-2xl` |

## Component Library

None. Plain Tailwind utility classes, with hand-written components
under `src/components/`, nested per feature area once a directory
holds more than a couple of files (`src/components/games/coinflip/`).

HeroUI was documented here from the project's first day and was never
installed — the login page and the landing mockup were both built
without it, so this section now records what the repo actually does.
Adding a component library later is a real option, but it is a
deliberate decision to make on its own merits, not something to
inherit from the reference repo.

## Layout Patterns

- Game page: fixed bet/control panel (left, or bottom on mobile) +
  game canvas (center) + live chat and round history (right,
  collapsible on mobile)
- Lobby: grid of game cards, each showing a thumbnail, name, and live
  player count
- Wallet drawer: a single slide-over showing wallet balance, table
  balance, and buy/cash-out actions — this is the one place
  blockchain details (chain, address, tx hash) are exposed, behind an
  "Advanced" toggle
- Modals: centered overlay with backdrop blur, used for the KYC step,
  confirmation on large wagers, and cash-out confirmation

## Icons

Lucide React, stroke-based only. `h-4 w-4` inline, `h-5 w-5` in buttons.

## Image & Asset Dimensions

| Asset | Size | Notes |
| --- | --- | --- |
| Favicon | 32×32, 180×180 (apple-touch), 512×512 (PWA) | SVG source, PNG exports |
| App / social icon | 512×512 | Square, transparent background |
| OG / social share image | 1200×630 | Used for link previews |
| Hero banner (desktop) | 1600×600 | Landing page top |
| Hero banner (mobile) | 800×1000 | Portrait crop of the same composition |
| Game thumbnail | 400×300 (4:3) | Lobby grid cards |
| Avatar | 256×256 | Circular mask, optional tier-ring overlay |
| Leaderboard / tier badge | 64×64 | SVG preferred for crisp scaling |

## Onboarding / Process Diagrams

For any flow diagram used in marketing or docs (onboarding, deposit
flow, etc.), keep a consistent visual spec so they read as one family
rather than being copied from any reference material:

- Canvas: portrait, ~760px wide
- Step block: rounded rectangle, 8px corner radius, ~700px wide ×
  110–130px tall
- Vertical gap between steps: 40–60px, connected by a single straight
  arrow
- Numbered badge: 36px circle, top-left of each block
- Heading: 20–22px bold; supporting line: 15–16px regular
