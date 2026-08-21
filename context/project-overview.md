# Hoodstack

## Overview

Hoodstack is a real-money web3 casino built to feel like an ordinary
betting app. A player connects a wallet they already hold funds in,
or signs up with email or Google to get a self-custodial embedded
wallet automatically, and plays provably-fair games — Coinflip,
Crash, Mines, and Roulette — with instant settlement and on-demand
cash-out. Hoodstack does not operate its own fiat on-ramp: a player
with no crypto yet acquires it through a self-custody wallet's own
built-in purchase flow (e.g. MetaMask's native Buy, backed by
MoonPay under MetaMask's own compliance relationship, not
Hoodstack's) and connects that wallet. The blockchain (Robinhood
Chain by default, BNB Smart Chain as an alternate rail) exists only
in the machinery from there — deposits and withdrawals are gasless
(x402 + Permit2), so a funded player never buys gas, approves a
token, or has to understand what a wallet address is unless they go
looking for it in Settings.

This product is a regulated real-money gambling business in
essentially every jurisdiction. This document defines the product; it
does not constitute legal clearance to operate. Licensing, KYC/AML,
age verification, and responsible-gambling requirements must be
resolved with qualified counsel before real-money launch — see Open
Questions in `progress-tracker.md`.

## Goals

1. Get a person with zero crypto experience from landing on the site
   to placing their first bet in under two minutes, without exposing
   blockchain terminology in the primary flow.
2. Keep games fast (Crash in particular needs sub-second
   responsiveness) by settling rounds against an off-chain ledger and
   reserving on-chain transactions for funding and cash-out events only.
3. Make every game round independently, cryptographically verifiable
   without requiring the player to understand how.
4. Support Robinhood Chain and BNB Smart Chain behind one consistent
   experience — chain choice is a backend/operator decision, not
   something a typical player picks.
5. Treat age verification, KYC, and responsible-gambling controls as
   first-class onboarding requirements, not features bolted on before
   launch.

## Core User Flow

Funding path depends on what the player already has:

- **A — Already holds funds in a wallet.** Connect an existing EVM
  wallet (MetaMask, Rabby — confirmed to support adding Robinhood
  Chain and BSC as custom networks; Phantom does not and is excluded).
  Skip to step 4.
- **B — Holds crypto elsewhere (an exchange, another wallet) but no
  dedicated wallet for Hoodstack.** Sign up (step 1), then send
  USDG/USDT from wherever it's held to the embedded wallet's receive
  address, shown up front in the wallet drawer.
- **C — Has no crypto at all.** Sign up (step 1), then get a
  self-custody wallet — MetaMask recommended — and buy crypto through
  that wallet's own native purchase flow. Connect that wallet.

1. Player signs up with email or Google — an embedded, self-custodial
   wallet is created automatically, no seed phrase shown. (Skipped by
   path A.)
2. One-time age and identity verification, required before the first
   deposit — via Hoodstack's own KYC vendor, independent of any
   wallet's or on-ramp's KYC.
3. Funds arrive at a wallet Hoodstack can read: the connected external
   wallet (A, C) or the embedded wallet after an external transfer (B).
4. Player moves funds into their table balance with a single gasless
   signature (x402 + Permit2) — no separate "network fee" step.
5. Player plays Coinflip, Crash, Mines, or Roulette against their
   table balance, settled in real time over WebSocket.
6. Player cashes out at any time — table balance converts back to
   their connected wallet.

## House Edge

**1% uniform**, applied through each game's own mathematics rather than
as one shared constant. The value is deliberately recorded here, in the
product definition, because a payout multiplier that lives only in code
is an invention rather than a decision.

| Game | Edge | How it is applied |
| --- | --- | --- |
| Coinflip | 1% | `COINFLIP_PAYOUT_BPS = 19_800` — 1.98x on an even-money bet |
| Crash | 1% | 1% instant-bust probability at 1.00x; the rest of the curve is the fair distribution |
| Mines | 1% | Fair combinatorial payout for (mines, gems revealed), multiplied by 0.99 |
| Roulette | 2.70% | Structural, from a single-zero European wheel — there is no multiplier to tune |

Roulette is the reason this is not a single number. Its edge comes from
the zero pocket (1/37 = 2.70%), not from a haircut on the payout, so it
cannot be set to 1% without changing the wheel itself. A double-zero
American wheel would be 5.26%; European is the choice here.

Crash is a shared round -- one crash point, many players, each cashing
out independently -- not a per-player instant variant like Coinflip.
That has a real consequence for provable fairness, recorded in
`architecture.md` invariant 2: the crash point comes from a house-level
commitment, not any individual player's client seed, since a shared
outcome cannot be a function of one participant's private input without
giving that player collusion power over everyone else in the round.

Payouts are quoted as **total return including the stake**, not profit.
A winning 1.00 Coinflip wager returns 1.98 — recorded in the ledger as a
-1.00 `WAGER` row and a +1.98 `PAYOUT` row, netting +0.98. Any UI that
shows "0.98x" is describing the same event in profit terms; the ledger
and `services/games` both use return terms throughout.

1% matches what comparable provably-fair crypto casinos run, and it is
far easier to raise later than to lower after players have seen a number.


## Features

### Authentication & Account
- Embedded wallet created automatically on signup (email, Google, or
  phone) — no seed phrase exposed by default
- Optional "bring your own wallet" path (e.g. MetaMask) for players
  who already have one
- User profiles with avatars and levels
- Table balance and wallet balance shown separately, in USD,
  everywhere in the UI
- Transaction history covering fiat purchases, on-chain
  deposits/withdrawals, and game rounds
- Client seed management for provably-fair verification (available in
  Settings, not required reading)

### Game Features
- Real-time multiplayer via WebSocket (Coinflip, Crash, Mines,
  Roulette — ported from the nkosresearch/web3-casino reference UI)
- Provably fair: every round's server seed is committed before bets
  close and revealed after settlement
- Responsive design — desktop, tablet, mobile
- Live chat
- Personal game history
- Leaderboards

### Payments
- No in-app fiat on-ramp and no MoonPay/Transak partner relationship
  — funding depends on a connected or embedded wallet already
  holding, or acquiring, USDG/USDT. Players without crypto get it
  through their own wallet's native purchase flow, under that
  wallet's own KYB — not Hoodstack's.
- Gasless deposits and table-balance top-ups via x402 + Permit2
- Gasless (or facilitator-sponsored) withdrawals back to the player's
  connected wallet on-chain; cashing out to fiat, if desired, happens
  through that wallet's own sell/off-ramp flow, not Hoodstack's
- Hybrid balance model: off-chain ledger for gameplay speed, on-chain
  settlement for funding and cash-out

### Security & Compliance
- Age and identity verification before first deposit
- Secure WebSocket connections, session management
- Anti-cheat mechanisms
- Responsible-gambling controls: deposit limits, session reminders,
  self-exclusion (see Open Questions — jurisdiction-dependent specifics)

## Scope

### In Scope (v1)
- Coinflip, Crash, Mines, Roulette
- Embedded wallet + social login, with MetaMask-style fallback
- x402/Permit2 gasless deposit and withdrawal flow
- Robinhood Chain (default) and BNB Smart Chain

### Out of Scope (v1)
- Additional games from the reference repo's description (Slots,
  Jackpot, Poker)
- Chains beyond Robinhood Chain and BSC
- In-house KYC/age-verification system (v1 relies on
  on-ramp-provided or a single third-party vendor's KYC)
- Own fiat on-ramp/off-ramp integration (MoonPay, Transak, or
  otherwise) — funding and cash-out route through the player's own
  wallet instead

## Success Criteria

1. A non-crypto test user completes signup and, after getting funded
   via a self-custody wallet's own purchase flow, places a first bet
   without any blockchain terminology inside Hoodstack's own UI — the
   one unavoidable technical step (using an external wallet to buy
   crypto) happens in that wallet's onboarding, not in Hoodstack's.
2. A deposit reaches the table balance in a single signature with $0
   gas paid by the user.
3. Every settled round has a verifiable server-seed reveal in game
   history.
4. A withdrawal reaches the user's bank or card without the user
   manually handling gas or token approvals.