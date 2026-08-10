# x402 + Permit2 Payment Architecture

Deep-dive companion to `architecture.md`, covering the deposit and
withdrawal payment rail referenced there.

## Why x402 Here

x402 is an HTTP-native payment protocol: a client requests a
resource, the server responds `402 Payment Required` with payment
terms, the client signs an authorization and retries, the server (via
a facilitator) settles on-chain and fulfills the request. It was
built for paying per-API-call, but the same shape fits a "deposit
into casino balance" action cleanly: treat `POST /api/x402/deposit`
as the protected resource. The endpoint returns 402 with the deposit
amount and house treasury address; the wallet signs; the facilitator
settles; the ledger credits the user's table balance once settlement
is confirmed.

## Two Schemes, Two Uses

- **`exact`** — the buyer authorizes a specific amount. Use for
  standard deposits: "move $50 from my wallet to the house."
- **`upto`** — the buyer authorizes a maximum, the seller settles the
  actual amount. Use for withdrawals where the final amount may
  differ slightly after network/facilitator fees are deducted, so the
  user isn't asked to sign a brand-new authorization if the fee
  estimate shifts by a few cents.

## Settlement Path by Token

- **USDG on Robinhood Chain**: check whether USDG supports EIP-3009
  (`transferWithAuthorization`) at deployment. If yes, this is the
  simplest and fully gasless path — no Permit2 approval step at all.
- **USDT on BSC**: USDT deployments generally do not support
  EIP-3009, so this path goes through **Permit2**. Because BEP-20
  USDT also generally lacks EIP-2612 `permit`, the one-time Permit2
  approval either needs the user to pay a single on-chain gas
  transaction, or the facilitator sponsors that one approval
  transaction using x402's gas-sponsorship extension (ERC-20 Approval
  Gas Sponsorship) — recommended, since it's the only way to keep BSC
  deposits gasless end to end for the user.

## Deposit Flow (`exact` scheme)

1. User taps "Add to table balance" for an amount already sitting in
   their wallet.
2. Frontend calls `POST /api/x402/deposit`; the route returns `402`
   with `{ scheme: "exact", network, asset, amount, payTo:
   houseTreasuryAddress }`.
3. Wallet SDK prompts a single signature: either an EIP-3009
   `transferWithAuthorization` (USDG) or a Permit2-witnessed transfer
   authorization (USDT/BSC).
4. Frontend retries the request with the signed payload in the
   `X-PAYMENT` header.
5. `services/settlement` submits the signature to
   `x402ExactPermit2Proxy.settleWithPermit()` (or the EIP-3009 path)
   via the facilitator. The proxy enforces that funds only move to
   the `payTo` address in the original request — neither the
   facilitator nor the backend can redirect or resize the payment.
6. On confirmed settlement, `services/settlement` credits
   `services/ledger` with the confirmed amount, keyed by transaction
   hash for idempotency.

## Withdrawal Flow (`upto` scheme)

1. User requests a withdrawal of their table balance.
2. `services/ledger` debits the table balance and creates a pending
   withdrawal record.
3. Backend constructs an `upto` authorization (max = requested
   amount) from the house treasury to the user's wallet, or directly
   through the off-ramp provider if cashing straight to a bank/card.
4. Facilitator settles the actual amount (after any fee);
   `services/settlement` reconciles the confirmed on-chain amount
   against the pending record and marks it complete.
5. If the user wants fiat rather than on-chain tokens, that happens
   through their own connected wallet's native sell/off-ramp flow
   (e.g. MetaMask's Sell, under that wallet's own compliance
   relationship) — Hoodstack has no on-ramp or off-ramp partner
   relationship of its own.

## Facilitator

x402's CDP-hosted facilitator (Coinbase) is documented to cover Base,
Polygon, Arbitrum, and a handful of other EVM networks — **Robinhood
Chain and BSC are not confirmed as covered as of this writing.**
Because x402's contracts are permissionless and deploy to the same
address on any EVM chain via CREATE2, plan for a self-hosted
facilitator (the reference implementation is open-source) on both
chains as the default assumption, and treat CDP facilitator support
as a nice-to-have to revisit once Robinhood Chain's ecosystem tooling
matures. This is listed as an open question in `progress-tracker.md`.

## Ledger Interaction

`services/settlement` is the only caller of `services/ledger` for
deposit/withdrawal events. It:

- Never credits a balance from a client-reported "payment succeeded"
  message — only from a confirmed on-chain event it independently
  observed or the facilitator's signed settlement receipt.
- Uses the transaction hash as the idempotency key, so a retried
  webhook or a resubmitted confirmation cannot double-credit.
- Emits the same event shape whether the deposit came through the
  primary embedded-wallet path or the MetaMask fallback path — the
  ledger doesn't need to know which wallet type funded it.