# Progress Tracker

## Current Phase

- Build stage — wallet layer done, moving to payments

## Current Goal

- Stand up the embedded wallet + x402 deposit skeleton against a
  Robinhood Chain or BSC testnet before writing game logic — this is
  the highest-uncertainty part of the stack

## Completed

- **Wallet skeleton — verified end to end locally.** Next.js 15 +
  Privy + wagmi/viem. Email and Google login both working; embedded
  wallet provisions automatically with no seed phrase shown; balance
  reads and chain switching confirmed on both Robinhood Chain Testnet
  and BSC Testnet. Not yet deployed to the VPS.

## In Progress

- None

## Next Up

<<<<<<< Updated upstream
1. Deploy the wallet skeleton to the VPS (`npm run build` must pass
=======
1. Merge `feat/login-background` after CodeRabbit review; check animation
   cost on mobile (8 chips + 5 meteors under one SVG bloom filter)
2. Deploy to the VPS (`npm run build` must pass
>>>>>>> Stashed changes
   there) — see `README.md` for the deploy steps
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
- Does "Hoodstack" clear a trademark search in the target markets?
  Elevated risk: the name gestures at Robinhood, an actively defended
  trademark, while the product is unlicensed real-money gambling built
  on Robinhood's own chain. Needs a real trademark search before any
  public launch or marketing spend.
- When must users be prompted to link a backup login method, and is it
  a hard gate before first deposit? (see Session Notes — social-only
  login can permanently orphan a funded wallet)

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
- Chose Privy for the embedded wallet provider. Confirmed free: Privy's
  Developer plan includes all core features and only begins billing above
  10K MAU / 50K monthly signatures / $1M monthly transaction volume. The
  dashboard's "this app is in development mode — upgrade to production"
  banner is a mode switch, not a paywall.
  - Web3Auth (`@web3auth/modal`) was evaluated and rejected. Its free tier
    is 1,000 monthly active wallets (10x smaller), its repo has ~489 stars
    for key-management infrastructure, it is mid-rebrand under Consensys
    ownership, and its React hooks have documented reliability problems.
    Decisively, its `WagmiProvider` replaces the wagmi config rather than
    plugging into it and does not support external wagmi connectors —
    which would break the MetaMask "bring your own wallet" path in
    `project-overview.md` and make the provider expensive to swap later.
  - Building key management in-house was rejected outright: a homegrown
    signer would risk violating the "backend never has access to private
    keys" invariant in `architecture.md` and would turn the operator into
    a custodian of player funds, adding a custody/money-transmitter
    problem on top of gambling licensing.

## Standing Constraint: Wallet Provider Must Be a wagmi Connector

wagmi + viem (both MIT, no vendor account) are the foundation and stay the
abstraction layer. Any embedded-wallet provider must integrate *as a wagmi
connector*, never as a replacement for the wagmi config. This keeps
embedded-wallet users and MetaMask users flowing through the same hooks,
the same `services/ledger` address-ownership checks, and the same x402
endpoints — and makes the provider swappable if pricing or reliability
degrades. Reject any provider that cannot satisfy this.

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
- `next@15.4.0`–`15.4.7` carry CVE-2025-66478, a critical (CVSS 10.0)
  unauthenticated RCE in the App Router's RSC protocol. Patched in
  `15.4.8`. Pin `^15.4.8` or later. The advisory also recommends rotating
  all app secrets after patching — relevant once treasury keys exist.
- Alchemy is Robinhood's recommended infra provider for Robinhood Chain
  and runs a Bundler, Gas Manager, and Smart Wallets on it. Considered and
  set aside for now (would mean ERC-4337 smart accounts instead of plain
  EOAs) — worth revisiting if gas sponsorship needs grow beyond what x402
  covers.
- **Privy account-loss risk:** a user's Privy account and embedded
  wallet become permanently inaccessible if they lose their only login
  method, and social OAuth providers can suspend or delete accounts
  without notice — neither Anthropic-side nor Privy can re-link an
  account on a user's behalf. Privy's own guidance is that apps holding
  onchain assets must prompt users to link a durable backup (email,
  phone, or passkey) alongside social login. For a real-money casino
  this is a requirement, not a nice-to-have. Raised as an open question
  above.
- **`@x402/*` webpack workaround in `next.config.ts`:** wagmi's
  connectors barrel export pulls in Coinbase's Base Account connector →
  `@coinbase/cdp-sdk` → dynamic imports of optional `@x402/{core,evm,svm}`
  peer deps that aren't installed. Webpack resolves dynamic imports at
  build time and fails. Fixed with an `IgnorePlugin` matching `/^@x402\//`.
  Unrelated to this project's own x402 work, which runs through a
  self-hosted facilitator, not Coinbase's SDK. Remove only if the Base
  Account connector is ever adopted.
- **Privy smart wallets stay OFF.** Toggling them on switches users from
  embedded EOAs to ERC-4337 smart accounts, which sign via EIP-1271
  rather than plain ECDSA. The deposit rail in
  `x402-payment-architecture.md` assumes EOA signatures (EIP-3009
  `transferWithAuthorization`, Permit2-witnessed transfers); those paths
  need re-validation before any move to smart accounts. Decide this
  deliberately when building the x402 endpoint, not via a dashboard
  toggle.
- Robinhood Chain needs no Privy dashboard configuration — chains are
  supplied in code via `supportedChains` in
  `src/providers/app-providers.tsx`, reading `src/lib/chains.ts`.
- This chat's sandbox can reach npm/GitHub but not arbitrary IPs, so
  it can't SSH into the Hostinger VPS directly — deployment steps are
  written for the person (or Claude Code, which has real shell access
  on their Mac) to run themselves.
<<<<<<< Updated upstream
=======

## Session Notes (cont.)

- Deployed on Vercel (auto-deploy on push to main): hoodstack-tawny.vercel.app.
  Vercel Hobby is NON-COMMERCIAL only — Pro ($20/mo) required before launch.
  Vercel cannot host Socket.io or the settlement worker (serverless timeouts);
  those stay on the Hostinger VPS.
- Privy pattern learned the hard way: dashboard = PERMITTED, code
  `loginMethods` = DISPLAYED. Both required. External wallet login has its
  own dashboard toggle, separate from socials.
- Login methods live: Google, Twitter, external wallet (MetaMask/Rabby/
  Phantom). Email + SMS removed by choice. NO durable backup method — Privy
  warns lost sole login = permanently lost wallet AND funds. Passkeys are
  the intended fix before real money.
- `wallet_connect` omitted from walletList — Privy doesn't bundle
  WalletConnect; needs a project ID.
- Privy smart wallets stay OFF (EIP-1271 vs EOA signing would break the
  x402 deposit rail).
- VPS prepared but UNUSED: user `hoodstack` created, SSH key generated,
  deploy key NOT yet added to GitHub. No domain purchased — this blocks
  TLS and Google OAuth on the VPS.
- Phantom does not support adding Robinhood Chain or BSC as custom EVM
  networks (confirmed from the wallet debug panel showing a stale
  Network: 1 / Ethereum mainnet). Dropped from the BYOW wallet list;
  MetaMask and Rabby confirmed to support custom EVM chains.
- Decided this session: no in-app fiat on-ramp. MoonPay/Transak dropped
  as partner integrations on both deposit and withdrawal — see updated
  `project-overview.md` and `x402-payment-architecture.md`. Funding
  routes through a connected wallet's own native buy flow (e.g.
  MetaMask Buy via MoonPay, under MetaMask's KYB, not Hoodstack's);
  cash-out routes through that same wallet's sell flow. Reasoning:
  MoonPay's partner KYB review flags gambling as a regulated industry
  requiring proof of licensing, which Hoodstack doesn't have yet (see
  Open Questions).
>>>>>>> Stashed changes
