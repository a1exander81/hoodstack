# Progress Tracker

## Current Phase

- Build stage — wallet layer, x402 deposit route, and the self-hosted
  facilitator are all built, deployed (locally), and verified reachable.
  A real signed deposit through the browser UI is the last unverified
  link before ledger work can start in earnest.

## Current Goal

- Drive one real deposit through the actual browser UI (funded embedded
  wallet signing a real `PAYMENT` payload) to prove `/verify` → `/settle`
  end to end, not just that the facilitator is reachable.

## Completed

- **Wallet skeleton — verified end to end locally.** Next.js 15 +
  Privy + wagmi/viem. Email and Google login both working; embedded
  wallet provisions automatically with no seed phrase shown; balance
  reads and chain switching confirmed on both Robinhood Chain Testnet
  and BSC Testnet.
- **Wallet skeleton — verified end to end on Vercel
  (`hoodstack-tawny.vercel.app`).** Google login, external wallet
  connect, and balance reads confirmed working on both Robinhood
  Chain Testnet and BSC Testnet on the live production deployment —
  same checks as the local pass, now confirmed in production. Privy
  allowed domains and the Google OAuth redirect URI are both
  correctly configured for the Vercel domain.
- **Login UI merged** (`feat/login-background`, PR #1) — animated SVG
  background (falling neon chips, meteor streaks), Hoodstack branding,
  reduced-motion support. CodeRabbit checks passed, merged to `main`.
- **x402 deposit route merged, deployed, verified live**
  (`src/app/api/x402/deposit/route.ts`). Uses `x402ResourceServer` +
  `HTTPFacilitatorClient` from `@x402/core/server` and `ExactEvmScheme`
  from `@x402/evm/exact/server` — not `@x402/next`, which requires
  Next 16 and conflicts with the `^15.4.8` CVE-2025-66478 pin. Registers
  both `eip155:46630` and `eip155:97`. Hard runtime guards on every
  asset/facilitator env var, no silent fallback to a guessed address.
  CodeRabbit review passed, PR merged to `main` (squashed).
  `FACILITATOR_URL`/`HOUSE_TREASURY_ADDRESS` set as explicit,
  unmistakable placeholders (`.invalid` domain / zero address) in
  Vercel Production + Preview and in `.env.local`, so builds succeed
  everywhere without risking a placeholder being mistaken for real.
- **`next.config.ts`'s `@x402/*` `IgnorePlugin` re-scoped with
  `contextRegExp`** to only fire inside `@coinbase/cdp-sdk`'s own
  directory — the original name-only match would have silently
  broken our own new `@x402/core`/`@x402/evm` imports.
- **USDG on Robinhood Chain Testnet confirmed:**
  `0x7E955252E15c84f5768B83c41a71F9eba181802F` — verified directly
  against Paxos's own docs, not Robinhood's (whose testnet contracts
  table only lists WETH).
- **USDT on BSC Testnet: no canonical deployment exists.** Deployed
  our own `MockUSDT` (6 decimals, open `faucet(uint256)` mint) at
  `0xaA5E574E9cb6F8df5A47f2034d520AA7cee8a193` via Foundry
  (`contracts/mock-usdt/`). Verified live via `eth_getCode` and a
  successful mint confirmed through the on-chain `Transfer` event log.
- **Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) confirmed
  live on both testnets** via `eth_getCode` — deployment chain ID
  decoded from each bytecode blob (`0xB626`=46630, `0x61`=97) as
  additional confirmation beyond non-empty bytecode.
- **Production incident found and fixed same session: stray root-level
  `app/` directory silently shadowed `src/app/`.** The project uses
  `src/app/` (per `tsconfig.json`'s `@/*` → `./src/*` and every
  existing file), but the very first scaffold command this session
  created `app/api/x402/deposit/` at repo root instead. Next.js picked
  the root `app/` and stopped building `src/app/` entirely — every
  build from that point only ever listed `/api/x402/deposit` in its
  route table, never `/`. Went unnoticed through local testing, PR
  review, and merge; surfaced as a 404 on `hoodstack-tawny.vercel.app`
  after merging to `main`. Root cause and fix were both empirically
  verified in an isolated sandbox reproduction before shipping,
  not just reasoned about. Fixed via `git mv app/api/x402
  src/app/api/x402`; confirmed live via `curl` (200) and a visual
  screenshot showing the real login page and working wallet/chain
  switcher post-fix.
- **Self-hosted x402 facilitator built and verified reachable** (`facilitator/`
  — a new standalone directory, deliberately NOT `services/settlement`; see
  Open Questions below). Express server on `@x402/core` 2.21.0 + `@x402/evm`
  2.21.0, exposing `/verify`, `/settle`, `/supported`, `/health`. Registers
  `exact` (deposits) + `upto` (withdrawals) on both `eip155:46630` and
  `eip155:97`, each with its own chain-bound signer sharing one EOA gas
  wallet. Type-checked clean against the real published package types
  (not just reasoned about) before being handed off. `FACILITATOR_URL` in
  `.env.local` now points at `http://localhost:4022` for local dev (Vercel
  still on the `.invalid` placeholder — VPS deploy pending). Verified via a
  temporary request logger that `GET /supported` genuinely reaches this
  facilitator when the deposit route's `x402ResourceServer.initialize()`
  runs, and that the resulting `402` challenge carries the real verified
  USDG address. NOT yet verified: an actual signed `/verify` → `/settle`
  round-trip — needs a funded embedded wallet through the real UI, not curl.
  Gas wallet (dedicated, never the treasury key): funded with testnet ETH
  on Robinhood Chain Testnet and testnet BNB on BSC Testnet via each
  chain's official faucet.

## In Progress

- None

## Next Up

1. Drive a real signed deposit through the browser UI against the local
   facilitator — proves `/verify` → `/settle`, not just reachability.
2. Decide: keep or strip the temporary `[http]` request logger added to
   `facilitator/index.ts` for diagnosis this session — asked, not yet
   answered.
3. Decide who holds the house treasury's signing key —
   `HOUSE_TREASURY_ADDRESS` is currently the zero address as a
   placeholder everywhere, not a real value.
4. Fix `progress-tracker.md`'s (this file's) own past wording that
   called the facilitator `services/settlement` — `code-standards.md`
   defines `services/settlement` as the facilitator CLIENT + ledger
   reconciliation worker, not the facilitator server itself. Worth a
   pass to make sure nothing else in the docs repeats that mismatch.
5. Port the reference repo's Coinflip UI onto the new wallet layer as
   the first end-to-end playable path.
6. Deploy the facilitator (and later Socket.io + settlement worker) to
   the VPS. Needs a domain or `sslip.io` wildcard DNS first.

## Open Questions

- Which jurisdictions will Chipstack operate in at launch, and what
  license or registration does that require in each? Blocks go-live,
  not development.
- Who provides age/KYC verification — since MoonPay/Transak are no
  longer partner integrations, this needs a standalone site-level KYC
  vendor decision.
- What deposit/wager limits and responsible-gambling controls
  (self-exclusion, deposit caps, cool-off periods) are required for
  the target jurisdictions?
- Who holds the house treasury's signing key for settlement —
  self-hosted HSM, or a custody provider?
- Does the CDP-hosted x402 facilitator cover Robinhood Chain and BSC,
  or does this need a self-hosted facilitator? (see
  `x402-payment-architecture.md`) **Partially answered:**
  `@x402/evm`'s documented default network list doesn't include either
  chain — self-hosted is confirmed necessary. Still open: where it
  actually runs.
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
- Identity model: a user's table balance is owned by their Privy DID
  (`user.id`), not a raw wallet address — a DID may have multiple
  linked addresses (embedded + external) sharing one balance. Two
  separately-created DIDs are never auto-merged, even for the same
  human. See `architecture.md` Auth and Access Model.

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
  TLS and Google OAuth on the VPS. Not urgent yet: the wallet skeleton
  doesn't need the VPS at all (it's fully served from Vercel); the VPS
  is only needed once Socket.io and the settlement worker exist.
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
- **Wallet skeleton fully verified on Vercel production** (Google
  login, external wallet connect, balance reads on both testnets) —
  the "Deploy the wallet skeleton to the VPS" item from the prior
  Next Up list is retired as written; Vercel already serves the
  wallet skeleton in production. The VPS is now scoped narrowly to
  Socket.io + the settlement worker, deferred until those are built.
- **`@x402/next` requires Next 16** — do not force-install with
  `--legacy-peer-deps` on this path. Use `@x402/core/server`'s
  `x402ResourceServer` + `HTTPFacilitatorClient` directly instead.
- **Path alias gotcha:** `tsconfig.json`'s `@/*` already maps to
  `./src/*` — import as `@/lib/...`, not `@/src/lib/...`.
- **The facilitator's private key is a gas wallet only** — pays gas
  to broadcast settlements, never custodies user funds. Separate
  concern from the still-open "who holds the house treasury key"
  question above.
- **`contracts/mock-usdt/`** is a Foundry project nested in the main
  repo, gitignored for `lib/`, `out/`, `cache/`, `broadcast/`.
- **This project's real app directory is `src/app/`, not `app/`** —
  `code-standards.md`'s File Organization section currently lists
  paths like `app/(marketing)/` and `app/api/` without the `src/`
  prefix, which doesn't match reality and directly caused tonight's
  incident (see Completed). Worth fixing that doc so neither a future
  session nor Claude Code gets misled the same way again.
- **Vercel CLI needed `vercel link` before any `env add` command
  worked** — this repo's deploys had only ever gone through git-push
  auto-deploy before, never the CLI.
- **`vercel env add <name> preview` is a two-prompt interactive
  command (value, then git branch) that cannot be reliably driven via
  piped stdin** — `echo`/`printf` pipes produced silent partial
  failures (var added to Production but not Preview, no error shown)
  across several attempts. Run it fully interactively; hit Enter on
  the blank "Git branch?" prompt to apply to all preview branches.
- **The `app/`→`src/app/` hotfix was committed directly to `main`**,
  bypassing the branch → PR → CodeRabbit flow used for everything else
  this session and for PR #1. Deliberate one-off for an active
  production 404, not a new pattern to repeat.
