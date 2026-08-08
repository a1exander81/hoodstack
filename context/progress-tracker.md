# Progress Tracker

## Current Phase

- Planning / spec stage — not started

## Current Goal

- Stand up the embedded wallet + on-ramp + x402 deposit skeleton
  against a Robinhood Chain or BSC testnet before writing game logic
  — this is the highest-uncertainty part of the stack

## Completed

- None yet

## In Progress

- Wallet skeleton (Next.js 15 + Privy + wagmi/viem, Robinhood Chain
  Testnet + BSC Testnet configured, sign-in → embedded wallet →
  balance read on a verification page). Scaffolded locally; not yet
  run, not yet deployed. See `chipstack-app/README.md` in this
  session's output for setup and VPS deployment steps.

## Next Up

1. Run the wallet skeleton locally, confirm sign-in → wallet →
   testnet balance read works on both chains, then deploy to the VPS
   — mark this unit complete once `npm run build` passes there too
2. Sandbox the MoonPay on-ramp integration (confirmed live for USDG
   on Robinhood Chain at mainnet)
3. Build the x402 deposit-required endpoint and Permit2 settlement
   worker on testnet
4. Port the reference repo's Coinflip UI onto the new wallet layer as
   the first end-to-end playable path

## Open Questions

- Which jurisdictions will Chipstack operate in at launch, and what
  license or registration does that require in each? Blocks go-live,
  not development.
- Who provides age/KYC verification — the on-ramp's built-in KYC
  (MoonPay/Transak), or a separate vendor for site-level gating
  before deposit?
- What deposit/wager limits and responsible-gambling controls
  (self-exclusion, deposit caps, cool-off periods) are required for
  the target jurisdictions?
- Who holds the house treasury's signing key for settlement —
  self-hosted HSM, or a custody provider?
- Does the CDP-hosted x402 facilitator cover Robinhood Chain and BSC,
  or does this need a self-hosted facilitator? (see
  `x402-payment-architecture.md`)
- Does "Chipstack" clear a trademark search in the target markets?

## Architecture Decisions

- Chose an EVM wallet stack (wagmi/viem + an embedded wallet SDK)
  over the reference repo's Solana Wallet Adapter, because Robinhood
  Chain and BSC are both EVM-compatible and Solana tooling doesn't
  apply.
- Chose a hybrid on-chain/off-chain balance model (ledger in
  Postgres, on-chain only for deposit/withdrawal) to keep game rounds
  fast — this matches the reference repo's own architecture.
- Chose x402's `exact` scheme for fixed-amount deposits and `upto`
  for withdrawal requests where the final amount may be adjusted by
  network or facilitator fees.
- Chose Privy over Dynamic for the embedded wallet provider —
  `@privy-io/wagmi` is a maintained drop-in for wagmi's `createConfig`,
  and `embeddedWallets.createOnLogin: "users-without-wallets"` covers
  the no-seed-phrase requirement directly with no custom glue code.

## Session Notes

- Reference repos reviewed: nkosresearch/web3-casino (frontend-only
  Next.js demo, Solana Wallet Adapter, no backend included) and
  Web3Auth/web3auth-web (embedded wallet SDK, evaluated as an
  alternative to Privy/Dynamic).
- Robinhood Chain went to public mainnet July 1, 2026 (Arbitrum-based
  L2); MoonPay confirmed live support for USDG on Robinhood Chain
  from mainnet launch.
- x402 is now stewarded by the x402 Foundation (transferred from
  Coinbase); contracts including `x402ExactPermit2Proxy` are
  open-source and deployable to any EVM chain via CREATE2.
- Robinhood Chain Testnet: chain ID 46630, RPC
  `rpc.testnet.chain.robinhood.com` (mainnet: chain ID 4663,
  `rpc.mainnet.chain.robinhood.com`) — sourced from docs.robinhood.com,
  not yet in viem's built-in chain list, defined by hand in
  `src/lib/chains.ts`. Native gas currency on Robinhood Chain is ETH,
  not USDG; irrelevant to players since x402 keeps them off gas
  entirely, but relevant when testing manually.
- `@privy-io/wagmi` has a known Turbopack build failure as of
  mid-2025 (`TypeError: s is not iterable`) — use the default webpack
  dev/build until it's confirmed fixed upstream, don't pass
  `--turbopack`.
- This chat's sandbox can reach npm/GitHub but not arbitrary IPs, so
  it can't SSH into the Hostinger VPS directly — deployment steps are
  written for the person (or Claude Code, which has real shell access
  on their Mac) to run themselves.
