# Chipstack

## Overview

Chipstack is a real-money web3 casino built to feel like an ordinary
betting app. A new player signs up with email, Google, or phone, gets
a self-custodial wallet automatically, buys "chips" with a card or
bank transfer, and plays provably-fair games — Coinflip, Crash, Mines,
and Roulette — with instant settlement and on-demand cash-out. The
blockchain (Robinhood Chain by default, BNB Smart Chain as an
alternate rail) exists only in the machinery. Deposits and
withdrawals are gasless (x402 + Permit2), so a player never buys gas,
approves a token, or has to understand what a wallet address is
unless they go looking for it in Settings.

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

1. Player signs up with email, Google, or phone — an embedded,
   self-custodial wallet is created automatically, no seed phrase shown.
2. One-time age and identity verification, required before the first
   deposit.
3. Player buys chips with a card, bank transfer, or Apple Pay through
   a fiat on-ramp; funds land as a stablecoin in their wallet.
4. Player moves chips into their table balance with a single gasless
   signature (x402 + Permit2) — no separate "network fee" step.
5. Player plays Coinflip, Crash, Mines, or Roulette against their
   table balance, settled in real time over WebSocket.
6. Player cashes out at any time — table balance converts back to
   their wallet and, optionally, straight back to a bank account or card.

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
- Fiat on-ramp (MoonPay primary — confirmed live USDG-on-Robinhood-Chain
  support at mainnet launch; Transak as broad-coverage fallback,
  including BSC/USDT)
- Gasless deposits and table-balance top-ups via x402 + Permit2
- Gasless (or facilitator-sponsored) withdrawals back on-chain, with
  an off-ramp path back to card/bank
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
- MoonPay + Transak on-ramp integration
- x402/Permit2 gasless deposit and withdrawal flow
- Robinhood Chain (default) and BNB Smart Chain

### Out of Scope (v1)
- Additional games from the reference repo's description (Slots,
  Jackpot, Poker)
- Chains beyond Robinhood Chain and BSC
- In-house KYC/age-verification system (v1 relies on
  on-ramp-provided or a single third-party vendor's KYC)

## Success Criteria

1. A non-crypto test user completes signup → funded → first bet
   placed without needing any blockchain term explained to them.
2. A deposit reaches the table balance in a single signature with $0
   gas paid by the user.
3. Every settled round has a verifiable server-seed reveal in game
   history.
4. A withdrawal reaches the user's bank or card without the user
   manually handling gas or token approvals.
