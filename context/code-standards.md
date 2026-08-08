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
- Route handlers under `app/api/wallet`, `app/api/onramp`, and
  `app/api/x402` run server-only and must never expose treasury key
  material to the client
- Keep each route handler focused on a single responsibility

## Styling

- Use the CSS custom property tokens defined in `ui-context.md` — no
  hardcoded hex values
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

- `app/(marketing)/` — public landing pages
- `app/(app)/games/` — game UI and per-game client logic
- `app/api/` — wallet, on-ramp, and x402 route handlers
- `services/ledger/` — the only balance-mutating code path
- `services/rng/` — provably-fair seed generation and reveal
- `services/settlement/` — on-chain settlement worker and facilitator
  client
