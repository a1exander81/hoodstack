# Code Standards

## General

- Keep modules small and single-purpose — a game's UI, its round
  logic, and its ledger effects are three different files, not one
- Fix root causes; do not layer workarounds, especially around
  balance or RNG logic
- Do not mix unrelated concerns in one component or route
- Financial correctness beats developer convenience — never skip an
  idempotency check or a balance assertion to save time

## TypeScript

- Strict mode required throughout
- No `any`, especially around monetary amounts — use a dedicated
  `Money` type (integer minor units, e.g. micro-USD) rather than
  `number`
- Validate all external input (on-ramp webhooks, x402 facilitator
  callbacks, client bet requests) at the boundary with a schema
  library (zod) before it touches any service

## Next.js

- Default to server components; add `use client` only where browser
  interactivity (game canvas, WebSocket subscriptions) requires it
- Route handlers under `src/app/api/wallet`, `src/app/api/onramp`,
  and `src/app/api/x402` run server-only and must never expose
  treasury key material to the client
- Keep each route handler focused on a single responsibility

## Styling

- Use the Tailwind color tokens defined in `tailwind.config.ts` and
  mirrored in `ui-context.md` (`bg-surface`, `text-muted`,
  `state-error`, ...) — no hardcoded hex values, and no raw Tailwind
  palette colors either (`bg-slate-900`, `text-red-500`), since those
  bypass the token scale without looking like they do
- Follow the border radius scale defined in `ui-context.md`

## API Routes

- Validate and parse request input before any logic runs
- Enforce auth and wallet-address ownership before any mutation
- Return consistent, predictable response shapes
- Every balance-mutating route must be idempotent (via an idempotency
  key or the on-chain tx hash) — retries must never double-credit or
  double-pay

## Money, RNG & Compliance

- Store all monetary amounts as integer minor units, never floating
  point
- Generate and hash the RNG server seed before a bet is accepted;
  never expose the raw seed until after settlement
- Treat every x402/Permit2 payload as untrusted until independently
  verified against on-chain state by `services/settlement` — never
  credit a balance on the client's say-so that a payment succeeded
- Age/KYC status is a hard gate on the deposit endpoint, enforced
  server-side, not just hidden in the UI

## Data and Storage

- Ledger entries in PostgreSQL are append-only; a user's balance is a
  derived sum, not a value stored and directly decremented/incremented
- Large or ephemeral state (live round ticks, presence) belongs in
  Redis, not the database
- Do not store large generated content (e.g. chat media) directly in
  the database

## File Organization

- `src/app/(marketing)/` — public landing pages
- `src/app/(app)/games/` — game UI and per-game client logic
- `src/app/api/` — wallet, on-ramp, and x402 route handlers
- `services/ledger/` — the only balance-mutating code path
- `services/rng/` — provably-fair seed generation and reveal
- `services/settlement/` — on-chain settlement worker and facilitator
  client

Note: this project scaffolds under `src/`, not a bare `app/` at repo
root (see `tsconfig.json`'s `@/*` → `./src/*`). A root-level `app/`
directory silently shadows `src/app/` in Next.js's build — this is
what caused the production incident logged in
`progress-tracker.md`'s Session Notes. Never create files under a
bare `app/`.
