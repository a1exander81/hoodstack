# Architecture Context

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Full-stack app; server components for game/lobby pages, route handlers for wallet/x402/KYC endpoints |
| UI | Tailwind CSS (no component library) | Hand-written components under `src/components/`. Color and radius tokens live in `tailwind.config.ts`, mirrored in `ui-context.md`. HeroUI was documented early but never installed — see `ui-context.md` |
| Wallet / Web3 | Embedded wallet SDK (Privy) + wagmi + viem | Social-login embedded wallets and EVM chain interaction. **Replaces** the reference repo's Solana Wallet Adapter — Robinhood Chain and BSC are both EVM chains, so Solana tooling doesn't apply here |
| Chains | Robinhood Chain (Arbitrum-based L2, mainnet since July 1, 2026) + BNB Smart Chain | Settlement chains. USDG is Robinhood Chain's native dollar asset; USDT is used on BSC |
| Payments | x402 (HTTP-native payment protocol, now under the x402 Foundation) + Permit2 (Uniswap) | Gasless authorization from user wallet to house treasury — see `x402-payment-architecture.md` |
| Real-time | Socket.io (WebSocket) | Live round state, chat, leaderboard updates |
| Cache | Redis (ioredis), in-memory fallback | Active round state, rate limiting, WebSocket presence |
| Ledger | PostgreSQL (Prisma) | Off-chain house-balance ledger, KYC/age status, RNG seed records, deposit/withdrawal records |
| Auth | Embedded wallet SDK's built-in auth (email/Google/phone OTP) | No separate auth system — identity and wallet are provisioned together |
| Compliance | Dedicated third-party KYC/age-verification vendor, independent of any connected wallet's own on-ramp KYC | Required before first deposit in essentially every jurisdiction |

## System Boundaries

- `app/(marketing)` — public landing pages, no wallet or session required
- `app/(app)/games/*` — game UI (Coinflip, Crash, Mines, Roulette), requires an active session
- `app/api/wallet/*` — thin proxy to the embedded-wallet SDK; never touches private key material
- `app/api/kyc/*` — creates and verifies sessions with the site-level KYC/age-verification vendor; the source of truth for a user's verified status, independent of any wallet's own on-ramp KYC
- `app/api/x402/*` — implements the 402-challenge/response cycle for deposit and withdrawal endpoints
- `services/ledger` — the only code path permitted to mutate a user's table balance
- `services/rng` — provably-fair seed generation and commit/reveal, isolated from the ledger and from any client-writable path
- `services/games` — pure, deterministic round resolution. One resolver per game maps a float from `services/rng` plus the player's bet to an outcome and a payout. No database, no network, no app state: given the same inputs it must return the same result forever, because that is what a player re-deriving a settled round from a revealed seed computes. `services/ledger` imports these to derive a payout authoritatively rather than trusting a caller-supplied figure
- `services/settlement` — reconciliation module, not a background worker. `reconcileSettledDeposit()` is invoked synchronously via `resourceServer.onAfterSettle(...)`, registered inside the x402 deposit route handler (`src/app/api/x402/deposit/route.ts`); it runs inline in the same request as the deposit, not as a separate process. On-chain verify/settle submission itself is handled by the self-hosted `facilitator/` service via `@x402/core`'s `x402HTTPResourceServer` — `services/settlement` only picks up once that resolves, and credits `services/ledger` with the confirmed tx hash and amount

## Storage Model

- **PostgreSQL**: user profiles, KYC/age-verification status,
  house-balance ledger (append-only entries, keyed by Privy DID — the
  current balance is a derived sum, never a single mutable column),
  game round history, RNG server-seed hashes and reveals,
  deposit/withdrawal records with their on-chain transaction hashes.
- **Redis**: active round state (e.g. the live Crash multiplier tick,
  an in-progress Mines board before settlement), WebSocket presence,
  rate-limit counters. Nothing here is the source of truth for money.
- **On-chain (Robinhood Chain / BSC)**: custody of a player's
  self-custodial wallet funds until deposited, the house treasury
  wallet, and deposit/withdrawal settlement transactions only. Game
  outcomes are not recorded on-chain — this matches the reference
  repo's existing pattern and is what keeps rounds fast.

## Auth and Access Model

- Every user gets a self-custodial embedded wallet on first login;
  the wallet provider (Privy) manages key material via MPC/TEE — the
  application backend never has access to private keys.
- A user's table balance is owned by their Privy user ID (DID), not a
  raw wallet address. `services/ledger` resolves the authenticated
  session to a Privy DID, then verifies that the specific address
  involved in a mutation (deposit sender, withdrawal recipient) is
  currently one of that DID's linked accounts before proceeding. A
  single DID may have multiple valid addresses — its embedded wallet
  plus any linked external wallets — all sharing one balance.
- The app does not merge balances across two separately-created Privy
  DIDs, even when they likely belong to the same human (e.g. one
  created via Google signup, one via a standalone wallet login).
  Users are steered toward linking an external wallet to an existing
  session rather than logging into a fresh one with it; unifying two
  already-separate accounts is a manual support/compliance action,
  not an automatic one.
- Withdrawals require an active session plus a fresh signature before
  funds are released on-chain, to prevent a hijacked session from
  triggering a payout.
- The "bring your own wallet" path (MetaMask, Rabby — confirmed to
  support adding Robinhood Chain and BSC as custom networks; Phantom
  does not and is excluded) uses the same ledger and x402 endpoints —
  it differs only in how the wallet is connected, not in how funds
  move.

## Invariants

1. No route mutates a user's table balance except through
   `services/ledger`, and every mutation must be tied to a settled
   on-chain deposit, a settled game round carrying a published seed
   commitment, or a submitted withdrawal. Note "commitment", not
   "revealed seed": under the seed-pair model in invariant 2 the raw
   server seed is not revealed until the pair is rotated, which is
   after settlement, so requiring a revealed seed at payout time
   would forbid every payout. "A settled game round" covers both
   shapes described in invariant 2: a per-user `GameRound` settled
   against that user's own seed pair (Coinflip, Mines, Roulette), and
   a `CrashBet` resolved (by cash-out or by the round ending) against
   a shared, round-level commitment (Crash). Both require the
   commitment to exist before the bet; neither requires the seed to be
   revealed before payout.

   Crash's two-phase settlement (`placeCrashBet`/`settleCrashBet`) is a
   deliberate exception to "tied to a settled round" for exactly one
   side of the ledger: the `WAGER` debit happens at `placeCrashBet`
   time, against a `CrashBet` that is only PLACED, not yet resolved --
   the round it belongs to must already have a published commitment and
   be open for betting, but settlement (and any `PAYOUT`) genuinely
   happens later, from a separate call. This does not weaken the
   invariant: the debit is still gated on an open, committed round
   (`placeCrashBet` row-locks `CrashRound` and rejects anything not
   BETTING), and no credit is ever issued except through
   `settleCrashBet`'s own settled resolution. Coinflip/Mines/Roulette
   have no equivalent pre-settlement mutation -- `settleInstantRound`
   debits and credits in the same transaction, so this exception is
   Crash-specific.
2. The client is never trusted for game outcomes. Randomness uses a
   seed-pair commit/reveal scheme: a server seed is generated and its
   SHA-256 hash published to the player *before* any bet against that
   pair is accepted. One server seed covers many rounds, each
   distinguished by a strictly incrementing per-pair nonce, so a
   round's outcome is fixed by (server seed, client seed, nonce) and
   nothing the client sends after the commitment can change it. The
   raw server seed is revealed when the player rotates the pair, at
   which point that pair is closed permanently: a revealed seed is
   never reused, and no round is ever accepted against an
   already-revealed pair.

   Chosen deliberately over per-round reveal. Per-round reveal would
   publish the seed at settlement and satisfy a stricter reading of
   this invariant, but it makes the player's client seed inert --
   there is nothing to manage across rounds, which is the feature
   `project-overview.md` lists under Settings. Seed pairs are also
   the model existing third-party provably-fair verifiers already
   implement, so players can check rounds with tools we did not
   write.

   Operational consequence, stated because it is easy to miss: the
   server seed sits in Postgres in plaintext until reveal. Read
   access to that database is equivalent to knowing every unsettled
   round's outcome. See `progress-tracker.md` Open Questions.

   **Crash is a deliberate second case, not a variant of the above.**
   A per-user seed pair cannot produce Crash's crash point: many
   players share one round and therefore must share one outcome, and
   if any single player's client seed fed that outcome, that player
   could bias the round against everyone else in it. Crash's
   commitment is instead round-scoped (`CrashRound`, not `SeedPair`):
   a house-generated server seed whose hash is published to every
   connected client before that round's betting window opens, with
   the raw seed revealed only after the round fully resolves (every
   bet cashed out or lost to the crash). The consequence stated
   plainly, not left implicit: a player's own client seed has no
   effect on a Crash round's outcome. This is the same category of
   tradeoff as the per-round-reveal option rejected above -- a
   feature (here, per-round player-influenced randomness) given up
   for a mechanical reason (a shared outcome cannot be a function of
   one participant's private input) -- not an oversight to fix later.
3. An x402/Permit2 signature authorizes a specific amount and
   destination only; neither the facilitator nor the backend can
   alter either value.
4. A user cannot wager funds that have not been deposited and
   confirmed on-chain — no negative balances, no credit extended.
5. Age and KYC verification — performed by a dedicated site-level
   vendor, independent of any connected wallet's own on-ramp KYC —
   must complete before a user's first deposit into their table
   balance.
6. Every balance-affecting endpoint is idempotent, so a retried or
   duplicated request cannot double-credit a deposit or double-pay a
   round.