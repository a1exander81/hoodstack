# Architecture Context

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Full-stack app; server components for game/lobby pages, route handlers for wallet/on-ramp/x402 endpoints |
| UI | HeroUI + Tailwind CSS | Component library and styling — reused from the nkosresearch/web3-casino reference frontend |
| Wallet / Web3 | Embedded wallet SDK (Privy or Dynamic) + wagmi + viem | Social-login embedded wallets and EVM chain interaction. **Replaces** the reference repo's Solana Wallet Adapter — Robinhood Chain and BSC are both EVM chains, so Solana tooling doesn't apply here |
| Chains | Robinhood Chain (Arbitrum-based L2, mainnet since July 1, 2026) + BNB Smart Chain | Settlement chains. USDG is Robinhood Chain's native dollar asset; USDT is used on BSC |
| Payments | x402 (HTTP-native payment protocol, now under the x402 Foundation) + Permit2 (Uniswap) | Gasless authorization from user wallet to house treasury — see `x402-payment-architecture.md` |
| Fiat on-ramp | MoonPay (live USDG-on-Robinhood-Chain support), Transak (fallback, broader BSC/USDT coverage) | Card/bank/Apple Pay to stablecoin — the only non-gasless, KYC'd step in the flow |
| Real-time | Socket.io (WebSocket) | Live round state, chat, leaderboard updates |
| Cache | Redis (ioredis), in-memory fallback | Active round state, rate limiting, WebSocket presence |
| Ledger | PostgreSQL (Prisma) | Off-chain house-balance ledger, KYC/age status, RNG seed records, deposit/withdrawal records |
| Auth | Embedded wallet SDK's built-in auth (email/Google/phone OTP) | No separate auth system — identity and wallet are provisioned together |
| Compliance | Third-party KYC/age-verification vendor, or the on-ramp's built-in KYC | Required before first fiat purchase in essentially every jurisdiction |

## System Boundaries

- `app/(marketing)` — public landing pages, no wallet or session required
- `app/(app)/games/*` — game UI (Coinflip, Crash, Mines, Roulette), requires an active session
- `app/api/wallet/*` — thin proxy to the embedded-wallet SDK; never touches private key material
- `app/api/onramp/*` — creates signed on-ramp sessions (MoonPay/Transak); verifies on-ramp webhooks
- `app/api/x402/*` — implements the 402-challenge/response cycle for deposit and withdrawal endpoints
- `services/ledger` — the only code path permitted to mutate a user's table balance
- `services/rng` — provably-fair seed generation and commit/reveal, isolated from the ledger and from any client-writable path
- `services/settlement` — background worker; submits signed Permit2/EIP-3009 authorizations to chain via the facilitator, reconciles on-chain confirmations back into the ledger

## Storage Model

- **PostgreSQL**: user profiles, KYC/age-verification status,
  house-balance ledger (append-only entries — the current balance is
  a derived sum, never a single mutable column), game round history,
  RNG server-seed hashes and reveals, deposit/withdrawal records with
  their on-chain transaction hashes.
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
  the wallet provider (Privy/Dynamic) manages key material via
  MPC/TEE — the application backend never has access to private keys.
- A user's table balance is owned exclusively by their wallet
  address; `services/ledger` enforces address-level ownership on
  every mutation.
- Withdrawals require an active session plus a fresh signature before
  funds are released on-chain, to prevent a hijacked session from
  triggering a payout.
- The optional "bring your own wallet" path (MetaMask etc.) uses the
  same ledger and x402 endpoints — it differs only in how the wallet
  is connected, not in how funds move.

## Invariants

1. No route mutates a user's table balance except through
   `services/ledger`, and every mutation must be tied to a settled
   on-chain deposit, a settled game round with a revealed seed, or a
   submitted withdrawal.
2. The client is never trusted for game outcomes — the RNG server
   seed is generated and hashed before a bet is accepted, and only
   revealed after settlement.
3. An x402/Permit2 signature authorizes a specific amount and
   destination only; neither the facilitator nor the backend can
   alter either value.
4. A user cannot wager funds that have not been deposited and
   confirmed on-chain — no negative balances, no credit extended.
5. Age and KYC verification must complete before a user's first fiat
   purchase, not after.
6. Every balance-affecting endpoint is idempotent, so a retried or
   duplicated request cannot double-credit a deposit or double-pay a
   round.
