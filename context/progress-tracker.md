# Progress Tracker

## Current Phase

- Build stage -- wallet layer, x402 deposit route, self-hosted
  facilitator, and `services/ledger` (deposit-credit only, PR #5
  merged) are all built and verified end to end: a real signed deposit
  settled on Robinhood Chain Testnet and credited into the ledger
  against a real local Postgres database, with idempotency proven via
  a retried credit attempt. Production has no reachable database yet
  -- that's the next blocker, not a new build unit.

## Current Goal

- Get a real, reachable Postgres database in front of Vercel's
  serverless functions -- `DATABASE_URL` doesn't exist in Vercel at
  all, and a Supabase project was created at the dashboard level this
  session but never wired into the repo (no connection string
  anywhere). Local Homebrew Postgres proved the ledger logic correct
  but can't be reached from production. Once resolved, wire
  `creditDeposit()` into an actual call site (no `services/settlement`
  worker or route calls it yet -- this session proved the ledger
  itself, not the pipeline into it).

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
- **Real signed deposit settled end to end on Robinhood Chain Testnet --
  the session's actual goal.** A funded embedded wallet
  (`0xc2413696576176d1e31D55a2DEdA609906a15596`) signed a real EIP-3009
  `transferWithAuthorization` for 1.011 USDG through the browser UI;
  the self-hosted facilitator's `/verify` and `/settle` both succeeded
  against it (`result.success: true`, tx
  `0x0244a82add3e8e809dc409e3a5858d6c409389437698e9c68d6d5320f9563187`).
  Independently confirmed via `cast call balanceOf` on the destination
  address -- `1011000` raw (1.011 USDG, matching the signed amount to
  the atomic unit), not just a green log line.
- **Deposit route rewritten, not just patched.** The original route
  hand-built a bare `NextResponse.json()` 402 body; that's not the
  real x402 v2 wire format (a `PAYMENT-REQUIRED` header, built via
  `x402HTTPResourceServer`) and was missing required
  `PaymentRequirements` fields (`maxTimeoutSeconds`, `extra`). Root
  cause found by reading the real installed `@x402/core`/`@x402/evm`
  `.d.ts`/`.js` source directly, not assumed from docs.
- **`src/lib/x402-next-adapter.ts` added** -- a trimmed port of
  `@x402/next`'s `NextAdapter`/`withX402` (Apache-2.0). Can't install
  `@x402/next` directly: its `package.json` pins
  `peerDependencies: { next: ">=16.2.6" }`, and this repo is
  deliberately on `^15.4.8` for CVE-2025-66478. Everything the port
  touches (`NextRequest`/`NextResponse`/`Headers`) is stable Web
  App Router API -- the peer range looks like a support-matrix choice,
  not a real Next 16 dependency. Revisit swapping in the real package
  if/when this repo moves to Next 16.
- **`@x402/fetch@2.21.0` added as a new dependency** -- the client-side
  402-challenge/sign/retry loop (`wrapFetchWithPayment`) isn't in
  `@x402/core/client`; it's this separate package. Matches the
  `@x402/core`/`@x402/evm` version family exactly.
- **Deposit request no longer takes `network` from the client body.**
  Both testnets are now offered as alternatives in the 402's
  `accepts[]`; the client SDK matches whichever the connected wallet's
  current chain actually supports. Chosen deliberately over the
  original body-field design -- matches `project-overview.md`'s "chain
  choice is a backend/operator decision" goal more directly.
- **USDG's real EIP-712 domain verified on-chain, not assumed:**
  `name: "Global Dollar"`, `version: "1"` -- confirmed by reproducing
  the actual on-chain `DOMAIN_SEPARATOR()` locally with `viem` across
  candidate version strings until one matched exactly. Wired into the
  Robinhood Chain `PaymentOption`'s `extra` field.
- **`/dev/x402-test` added** -- a dev-only browser page for driving a
  signed deposit through a connected wallet. USDG/Robinhood Chain
  Testnet only for now; BSC/MockUSDT needs a fuller `ClientEvmSigner`
  (`signTransaction`/`getTransactionCount`/`estimateFeesPerGas`) for
  Permit2's ERC-20 approval gas sponsorship extension, not yet
  implemented.
- **`services/ledger` built and merged** (PR #5, `feat/ledger-deposit-credit`).
  `creditDeposit()` is the only entry point that can mutate a table
  balance; idempotent via a DB-level unique constraint on `txHash`
  (not app-level check-then-insert -- correct under concurrent
  retries). `Money` is a branded `bigint` in integer minor units;
  since USDG/USDT are both 6-decimal stablecoins here, ledger
  micro-USD units equal raw on-chain token amounts 1:1, no scaling
  needed. Verified against the REAL settled Robinhood Chain Testnet
  deposit from a prior session (tx `0x0244a82add...9563187`, 1.011
  USDG) -- credited correctly, and a retried call with the same tx
  hash was rejected without double-crediting.
- **Postgres + Prisma set up from scratch this session** -- neither
  existed in the repo despite `architecture.md` listing them as the
  storage layer; this was a real gap, not a missing file. Local dev
  via Homebrew `postgresql@16` (trust auth, no password, DB name
  `hoodstack_dev`). Landed on Prisma 7.9.1, materially different from
  prior versions: driver adapters are now mandatory
  (`@prisma/adapter-pg` + `pg`), the generated client goes to a custom
  `output` path (`src/generated/prisma`) instead of `@prisma/client`,
  connection config moved to `prisma.config.ts`, and `migrate dev` no
  longer auto-runs `generate` -- needed as an explicit step, and as an
  explicit `postinstall` script for Vercel (the generated client is
  correctly gitignored as regenerable output, so a fresh clone
  produces nothing without one -- this broke the first Vercel deploy
  of the PR, fixed via `"postinstall": "prisma generate"` in
  `package.json`).
- **Identity correction:** the "funded embedded wallet"
  (`0xc2413696576176d1e31D55a2DEdA609906a15596`) referenced above in
  this file is actually an external Rabby Wallet connection per
  Privy's own API (`wallet_client_type: "rabby_wallet"`,
  `connector_type: "injected"`), not a Privy-provisioned embedded
  wallet. Doesn't affect the ledger (same DID either way), but matters
  for the backup-login-method open question below, which only applies
  to embedded wallets.

## In Progress

- None

## Next Up

1. Hosted Postgres for production (see Current Goal) -- Supabase vs
   Neon vs Vercel Postgres still undecided; Supabase project exists
   in the dashboard but is fully unwired.
2. Confirm `hoodstack-tawny.vercel.app` (the actual production domain)
   reflects PR #5's squash-merge commit on `main` -- a deployment
   screenshot from tonight showed `Source: feat/ledger-deposit-credit`
   (pre-merge commit `4a2b3ec`) labeled `Environment: Production` on a
   branch-preview-style domain, not the main production alias. Almost
   certainly a stale/pre-merge deployment shown out of order, but
   worth a direct look before trusting the production domain is
   current, given this PR touches balance-mutating code.
3. `facilitator/` still isn't committed to git -- confirmed via
   `git status` this session (shows as untracked). No longer just a
   naming question carried from a prior session; it's a confirmed gap.
4. Real house treasury custody decision. `HOUSE_TREASURY_ADDRESS` is
   currently a disposable test address set only in local
   `.env.local` -- it is NOT a custody answer and must not reach a
   real deployment as-is.
5. Verify MockUSDT's real EIP-712 name/version on BSC Testnet
   on-chain (same method used for USDG previously) before testing the
   BSC deposit path.
6. Add `USDT_BSC_TESTNET_ADDRESS` to Vercel Production + Preview --
   currently local-only.
7. Decide: keep or strip the temporary `[http]` request logger in
   `facilitator/index.ts` -- asked, still not answered.
8. Fix the embedded-wallet chain-switch bug: Privy's
   `defaultChain: robinhoodChainTestnet` did not actually put a fresh
   embedded wallet on Robinhood Chain Testnet -- it showed `Network: 1`
   until manually switched via the wallet debug panel. A real player
   would silently hit this.
9. Fix the React "missing key prop" console warning (likely the
   wallet debug panel mapping `supportedChains` without a `key` --
   not confirmed).
10. Reconcile `services/settlement` vs `facilitator/` naming across
    the docs -- still open.
11. Port the reference repo's Coinflip UI onto the wallet layer.
12. Deploy the facilitator (and later Socket.io + settlement worker)
    to the VPS. Needs a domain or `sslip.io` wildcard DNS first.
13. Add `PRIVY_APP_SECRET` to Vercel once server-side Privy lookups
    (like tonight's wallet-address-to-DID lookup) are needed in
    production -- currently local-only in `.env.local`, correctly
    excluded from git.

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
  self-hosted HSM, or a custody provider? **Still unresolved** -- a
  disposable test address was set locally tonight purely to unblock
  verifying `/verify`->`/settle`, not as a candidate answer.
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
- Does MockUSDT's BSC Testnet deployment support EIP-3009, or does
  it need the Permit2 path? (`x402-payment-architecture.md` already
  assumes Permit2 for BSC USDT generally -- worth confirming against
  the actual `MockUSDT` Foundry contract before verifying its domain.)

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
- `services/ledger` idempotency is enforced at the DB level (a unique
  constraint on `txHash`, caught via error code on conflict), not via
  an app-level check-then-insert -- the latter has a race window under
  concurrent retries (e.g. a duplicated webhook) that the DB
  constraint doesn't.
- `Money` is a branded `bigint`, not a plain `bigint` or `number` --
  chosen so the type system, not convention, prevents an unvalidated
  raw amount from reaching a ledger mutation. `services/ledger`'s
  exported input type uses `z.input<...>`, not `z.infer<...>`, since
  the latter is the schema's post-transform (already-branded) output
  type and can't be satisfied by a caller passing a plain amount.

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

## Session Notes (cont. 2)

- Landing page direction picked for `app/(marketing)`: energetic/neon
  hero (AI-generated reference, not a competitor asset), signature
  element is a live Crash-multiplier curve rather than stock rocket/chip
  imagery, ticker keeps "recent wins" energy without wallet-flex or
  degen slang. Design plan proposed, nothing built yet — was waiting on
  `find src/app -maxdepth 2 -type d` to confirm whether `(marketing)`
  already exists and what the root layout looks like before placing
  files. Pick this up next session with that command first.
- SVG background swap for the login page: still an open, unconfirmed
  ask. The uploaded file was a mismatched restaurant/food template, not
  intended for Hoodstack — nothing changed on the login page.

## Session Notes (cont. 3)

- **Real deposit settled end to end** -- tx
  `0x0244a82add3e8e809dc409e3a5858d6c409389437698e9c68d6d5320f9563187`
  on Robinhood Chain Testnet, 1.011 USDG,
  `0xc2413696576176d1e31D55a2DEdA609906a15596` -> the disposable test
  treasury address. This was tonight's actual goal from the top of
  this file -- achieved.
- **Deposit route was fundamentally incomplete, not just missing
  verify/settle.** Reading the real installed `@x402/core@2.21.0` /
  `@x402/evm@2.21.0` `.d.ts` and `.js` source (not just package docs)
  surfaced that the original hand-built 402 response skipped the
  SDK's actual `PAYMENT-REQUIRED` header encoding and was missing
  required `PaymentRequirements` fields entirely. Confirmed by reading
  `@x402/next`'s and `@x402/express`'s real compiled source (pulled via
  `npm pack` into a scratch sandbox, not assumed from any blog/doc) --
  `@x402/next`'s adapter code turned out to be pure stable
  `next/server` API despite its `>=16.2.6` peer-dependency pin, so it
  was ported rather than rewritten from scratch.
- **USDG's EIP-712 domain (`name`/`version`) verified by reproducing
  the on-chain `DOMAIN_SEPARATOR()` locally**, not guessed -- `version()`
  reverts on the token itself (no getter), so candidate version
  strings were hashed with `viem` until one matched the real on-chain
  separator exactly. `version: "1"` confirmed this way.
- **`USDT_BSC_TESTNET_ADDRESS` was completely missing from
  `.env.local`** despite MockUSDT having been deployed and documented
  in a prior session -- added locally tonight
  (`0xaA5E574E9cb6F8df5A47f2034d520AA7cee8a193`), still needs adding
  to Vercel.
- **Privy embedded wallet chain bug found:** a fresh embedded wallet
  did not land on `robinhoodChainTestnet` despite
  `defaultChain: robinhoodChainTestnet` in `app-providers.tsx` -- it
  showed `Network: 1` until manually switched via the debug panel's
  chain-switch buttons. Not investigated further; worth reproducing
  cleanly and possibly filing against Privy if it's their bug rather
  than a config gap here.
- **Design change:** the deposit request no longer takes `network`
  from the client body -- both testnets are declared as alternatives
  in the 402 `accepts[]`, and the client SDK's registered scheme
  naturally matches whichever chain the connected wallet is actually
  on. Chosen with the person's explicit go-ahead mid-session, since
  it better matches `project-overview.md`'s stated goal that chain
  choice is a backend decision, not a player-facing one.
- **`@x402/fetch@2.21.0` added as a new npm dependency** -- needed for
  `wrapFetchWithPayment` client-side; not covered by `@x402/core` or
  `@x402/evm` alone.

## Session Notes (cont. 4)

- **Postgres/Prisma didn't exist in this repo at all going into
  tonight** -- `find . -name schema.prisma` came back empty despite
  `architecture.md` documenting Postgres as the storage layer.
  Confirmed via `grep -i prisma package.json` (nothing) and
  `.env.local` (no `DATABASE_URL`) before installing anything.
- **Prisma 7.9.1 is a major version released after this chat's
  reliable knowledge cutoff** -- verified its driver-adapter
  requirement, custom `output` path, and `migrate dev` no longer
  auto-running `generate` against Prisma's own current docs before
  writing any code, rather than assuming from older training
  knowledge. Worth remembering for any future Prisma-adjacent work
  this project does: check current docs first, don't assume.
- **`services/ledger` was fully built, verified against the real
  settled deposit, and had a clean `npm run build` locally before any
  git operations** -- multiple real bugs caught in that sequence, not
  hypothetical: a `z.infer` vs `z.input` type mismatch that made
  `creditDeposit()` uncallable with a plain amount; BigInt literal
  syntax (`0n`, `1_011_000n`) rejected by the TS build target across
  three files; and an early batch of file-creation commands that
  silently no-op'd (heredocs referencing files that were never
  actually created), caught by the next command failing rather than
  by review.
- **Privy DID lookup done via their REST API** (`POST
  /v1/users/wallet/address`, Basic auth with app ID + app secret)
  instead of hunting the dashboard -- confirmed against Privy's
  current API docs first since it's a secret-bearing request. DID for
  `0xc2413696576176d1e31D55a2DEdA609906a15596`:
  `did:privy:cmsn52rxu02ye0cl11k3aqoy0`. `PRIVY_APP_SECRET` added to
  `.env.local` only (never committed -- confirmed via `git log --all
  -- .env.local .env` coming back empty before any commit).
- **Vercel build failed on the first push**: `src/generated/prisma`
  is correctly gitignored as regenerable output, but nothing in the
  Vercel pipeline generated it before `next build` ran. Fixed with
  `"postinstall": "prisma generate"` in `package.json` -- confirmed
  via Prisma's own config reference that `prisma generate` (unlike
  `migrate`/`db push`) doesn't require `DATABASE_URL` to be set, so
  this didn't also require touching Vercel env vars.
- **PR #5 merged (squashed) to `main`.** A Vercel deployment
  screenshot taken right after showed `Source: feat/ledger-deposit-credit`
  at the pre-merge commit, labeled `Environment: Production`, on a
  branch-preview-style domain -- not `hoodstack-tawny.vercel.app`.
  Flagged in Next Up to confirm the real production domain reflects
  the post-merge `main` commit before trusting it.
