# Progress Tracker

## Current Phase

- Build stage -- wallet layer, x402 deposit route, self-hosted
  facilitator, and `services/ledger` (deposit-credit only, PR #5
  merged) are all built and verified end to end: a real signed deposit
  settled on Robinhood Chain Testnet and credited into the ledger
  against a real local Postgres database, with idempotency proven via
  a retried credit attempt. Production's database, the production
  domain's currency, and `facilitator/` being untracked are all
  resolved (see Completed). `creditDeposit()` is now wired into a real call site
  (`services/settlement`, PR #7) and verified against a real settled
  deposit -- that gap from prior sessions is closed. A landing/lobby
  mockup exists (not yet ported
  into real components) and the chat feature is fully architected with
  two decisions locked, but neither is built -- both are new threads
  from this session, not carried-over blockers.

## Current Goal

- No single actively-blocking item remains. The production domain is
  confirmed current, `facilitator/` is committed and merged, and a
  Vercel build break that surfaced along the way (see Completed) is
  fixed and verified. `creditDeposit()` is wired into a real call site and verified live
  in production (`hoodstack-tawny.vercel.app`, commit `1922147`). Top
  candidates from Next Up: port the landing/lobby mockup into real
  `src/app/(marketing)` components, get a domain in front of the VPS
  so the facilitator (and eventually chat) can actually deploy there,
  and settle the real house treasury custody question.

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
- **Hosted Postgres wired to Neon for production** -- Supabase was
  dropped as the candidate: the account already had 2 projects
  (Supabase's free-tier cap), both in use. Neon confirmed to allow up
  to 100 projects on its free tier (verified against Neon's own docs,
  not aggregator pricing pages) before switching. Project
  `dawn-dawn-53245798` created; connected via the Neon CLI
  (`neonctl`) rather than the dashboard -- `neon auth` (browser OAuth)
  then `neon connection-string --project-id ... --pooled --prisma` /
  without `--pooled` for the direct string, `--prisma` appending
  `connect_timeout=30` per Prisma's own recommendation. No code
  changes needed versus the Supabase plan: Neon speaks standard
  Postgres wire protocol, so the existing `@prisma/adapter-pg` setup
  applies unchanged -- `@prisma/adapter-neon`'s serverless driver is
  only needed on edge runtime, which this app doesn't use.
  `prisma migrate deploy` applied `20260811105405_add_ledger_entry`
  to Neon cleanly. `DATABASE_URL` (pooled, `-pooler` hostname) and
  `DIRECT_URL` (direct hostname) added to Vercel Production + Preview
  via `vercel env add` (sensitive, interactive, one at a time -- per
  the standing note below, piped stdin still isn't reliable for the
  preview branch prompt). Redeploy triggered via an empty commit.
  **Verified with a disposable script** (`scripts/verify-neon.ts`,
  deleted after use), not just trusted: ran a real `$queryRaw` against
  the exact pooled connection string now in Vercel, confirming both
  connectivity (`[ { connected: 1 } ]`) and that
  `20260811105405_add_ledger_entry` shows a real `finished_at`
  timestamp on Neon itself -- proof the production credential set can
  actually reach the migrated schema, not just that the CLI claimed
  success.
- **`USDT_BSC_TESTNET_ADDRESS` discovered already present in Vercel**
  (Production + Preview) via `vercel env ls` while confirming the new
  Neon vars landed -- timestamped ~1 day prior to this session, so it
  was added at some earlier point not documented here. Retires Next
  Up's "add to Vercel" item as already done; worth noting as a gap in
  session note discipline rather than treating it as tonight's work.
- **Production domain reconfirmed current.** `vercel inspect
  hoodstack-tawny.vercel.app --logs` showed `Cloning ... Branch: main,
  Commit: 3550355`, matching local `main`'s HEAD exactly at the time
  -- genuinely serving the current commit, not the stale pre-merge
  build a prior session's screenshot suggested. Closes out that Next
  Up item for real, not just by inference.
- **Landing/lobby mockup built** (`hoodstack-landing-mockup.html`,
  standalone artifact, not yet ported into `src/app/(marketing)`).
  Researched saaspo.com/templates and its industry/style-filtered
  pages (dark-mode, crypto, finance, gaming categories) for reference
  -- couldn't get real visual confirmation of specific templates
  through available tools (`web_fetch` can't render images, image
  search returned unrelated results), so recommended screenshots
  instead of guessing from template names/descriptions alone. Person
  then supplied a Bet26 Dribbble reference (neon purple/glow crypto
  casino UI) -- flagged directly against `ui-context.md`'s explicit
  "avoid the neon degen aesthetic" spec rather than silently building
  it. Resolved with a middle-ground direction: restrained near-black
  base per `ui-context.md`, more color allowed specifically in
  per-game cards. Built with Inter/IBM Plex Mono standing in for
  Geist (not on Google Fonts), a live-animated canvas Crash-multiplier
  curve as the signature hero element -- resolves a prior session's
  "energetic hero" decision through motion instead of neon color --
  and scoped strictly to the four in-scope games (Coinflip, Crash,
  Mines, Roulette), dropping Bet26's Wheel/Dice/Plinko. Reduced-motion
  respected throughout.
- **Real game art wired into the mockup.** Person supplied four
  images; swapped in as full-bleed `object-fit: cover` art (each
  source image a different, non-4:3 aspect ratio -- handled via crop,
  not distortion) with each game's muted accent color kept as a thin
  bar beneath, preserving the per-game color identity even with
  photographic/illustrated art. Two problems flagged explicitly before
  wiring rather than silently absorbed: the Crash image is
  neon/glow-heavy, the same aesthetic family `ui-context.md` says to
  avoid; the Mines image has a decorative border baked into the source
  file that will double up against the card's own border-radius.
  Person's call: keep all four as-is, accepted as a known trade-off,
  not an oversight.
- **Chat feature fully architected, not yet built.** Researched
  self-hosted Socket.io (a `/chat` namespace on the same server
  already planned for game-round state, per `architecture.md`'s own
  listing) against managed alternatives (Stream, PubNub, Ably) --
  rejected the managed options on cost-at-scale, duplicated real-time
  infrastructure, and a second identity system to bridge against the
  Privy-DID model every other service already uses. Room scoping is
  per-game-page, not a global lobby -- already implied by
  `ui-context.md`'s existing Layout Patterns section, not a new
  decision. Persistence: a capped, TTL'd Redis buffer, not Postgres --
  matches `architecture.md`'s existing line that Redis isn't the
  source of truth for money, extended to chat history. Multi-instance
  Redis-adapter scaling deliberately deferred as unnecessary at
  current scale. Moderation: `leo-profanity` or `@2toad/profanity`
  (free, MIT) for profanity, a regex layer blocking emails/phone
  numbers/URLs specifically to deter off-platform payment
  solicitation -- a real risk pattern in gambling-adjacent chat, not a
  generic concern -- rate limiting reusing the Redis layer already
  planned, and DID-keyed mute/ban. **Two decisions locked:** usernames
  default to the wallet address's first 6 characters, user-editable
  between 4 and 8 characters (open sub-question for whenever this is
  built: which linked address's prefix wins when a DID has both an
  embedded and an external wallet); retention is auto-delete with no
  persistent history, and filtered/banned words are stripped rather
  than logged anywhere.
- **`facilitator/` committed to git** (previously untracked, confirmed
  via `git status` in a prior session). The directory's own
  `.gitignore` already correctly excluded `node_modules/` and `.env`
  (the gas wallet's private key) -- verified via a staged `git status`
  before committing, not assumed. `.env.example` got caught as
  false-positive collateral by the *root* repo's broader `.env*`
  gitignore pattern despite holding no real secrets; confirmed the
  actual matching rule via `git check-ignore -v` before force-adding
  it, rather than guessing. Branched properly
  (`feat/commit-facilitator`) rather than repeating the earlier
  direct-to-`main` hotfix pattern, since this wasn't an active
  incident.
- **Vercel build break found and fixed during the facilitator PR.**
  The preview build failed on `Cannot find module 'express'` inside
  `facilitator/index.ts`. Root cause: root `tsconfig.json`'s `include`
  had no `src/` scoping (a bare `"**/*.ts"`), so Next's type-checker
  swept in `facilitator/`'s code too -- and since `facilitator/
  node_modules` is gitignored and Vercel only ever runs `npm install`
  at the repo root, `express`'s types genuinely don't exist in that
  environment. Worked locally only because `facilitator/node_modules`
  already existed on-disk from local setup -- a real environment
  difference Vercel's clean install exposed, not a skipped check.
  Fixed by adding `"facilitator"` to `tsconfig.json`'s `exclude` array
  via the same anchor-verified script pattern used elsewhere. Fix
  verified clean via a second preview build (commit `6f2e9db`):
  compiled successfully, no type or lint error on `facilitator/`,
  `Deployment completed`.
- **PR #6 merged** (`8feb166`, a real merge commit, not squashed).
  A `vercel ls` moment right after looked identical to the earlier
  PR #5 stale-deployment scare -- a "Production, Building" entry
  appearing seconds after a branch push, seemingly unrelated to
  anything just pushed to `main`. Resolved by checking the actual
  commit in that deployment's build log rather than assuming either
  way: it was genuinely building `8feb166` off `main`, because Vercel
  kicks off a fresh Production deployment the instant a PR merges --
  the timing just happened to land in the same `vercel ls` window as
  watching the branch's own preview build. Confirmed against `git log
  -1 origin/main` matching exactly. Not a bug, a lesson (see Session
  Notes). Local `main` fast-forwarded, merged branch deleted.

- **`services/settlement` built, merged, and verified against a real
  settled deposit** (PR #7, `feat/settlement-ledger-wiring`, squash-
  merged to `main` as `1922147`). `creditDeposit()` finally has a
  real call site -- the gap flagged at the top of this file since
  PR #5.
  - **Where the credit actually happens, found by reading the
    compiled `@x402/core@2.21.0` server bundle** (not just the
    `.d.ts`): settlement happens *inside* `x402HTTPResourceServer`,
    invisible to the route handler. The only integration point with
    the confirmed on-chain tx hash is
    `resourceServer.onAfterSettle(...)`, registered in `route.ts`
    alongside the existing `.register(...)` calls. Also confirmed in
    the compiled source: every `afterSettle` hook runs inside the
    SDK's own try/catch, which only *warns* on failure and does not
    fail the settlement or change the client's response -- a thrown
    error in the hook is invisible to the player. This is why
    `reconcileSettledDeposit`
    (`services/settlement/reconcile-deposit.ts`) logs loudly
    (`console.error`) on failure rather than trusting the SDK to
    surface it.
  - **Identity gates BEFORE settlement, not after.** The route
    handler verifies a Privy access token
    (`Authorization: Bearer <token>`, via `@privy-io/node`'s
    `verifyAccessToken` against a static PEM key) before returning
    its response; a failed check returns 401, which
    `x402-next-adapter.ts` reads as >=400 and cancels settlement
    before any on-chain transaction is submitted. Deliberately chosen
    over deriving the DID from the settled `payer` address
    afterward, which would reopen the "which linked wallet's DID
    wins" ambiguity and let an unauthenticated caller's funds move
    with no way to credit them.
  - **`@privy-io/node@0.28.0` added** via `--legacy-peer-deps` --
    it optionally peers on `@solana/kit@^5.1.0`, conflicting with
    `@privy-io/react-auth`'s own optional `@solana/kit@2.3.0` peer.
    Same category as the existing `@x402/*` webpack `IgnorePlugin`
    workaround: an unused Solana path in Privy's bundled SDK,
    irrelevant to this EVM-only project.
  - **`NEXT_PUBLIC_PRIVY_APP_ID` reused server-side** instead of
    adding a duplicate `PRIVY_APP_ID` -- app IDs aren't secret,
    confirmed against Privy's docs before assuming.
    `PRIVY_VERIFICATION_KEY` added from Dashboard -> Settings ->
    Basics tab (not "Settings -> API," an early wrong guess
    corrected mid-session) to `.env.local` and to Vercel Production +
    Preview.
  - **`@services/*` path alias added to `tsconfig.json`**
    (`-> ./services/*`) specifically to avoid a five-level
    `../../../../../services/settlement` relative import out of
    `src/app/api/x402/deposit/` -- the same class of path mistake
    that caused the `app/`/`src/app/` incident two sessions ago.
  - **Real build-time bug, not review**: `creditDepositInputSchema`'s
    `z.coerce.bigint()` keeps its `z.input` type pinned to `bigint`
    despite accepting a string at runtime -- passing the settlement's
    `result.amount` string directly failed `npm run build`'s type
    check. Fixed with an explicit `BigInt(...)` instead of relying on
    coercion.
  - **`/dev/x402-test` now sends the access token.** Confirmed
    against the real installed `@x402/fetch@2.21.0` source that
    `wrapFetchWithPayment` clones the original `Request` -- headers
    included -- before adding payment-signature headers on retry, so
    `Authorization` survives the paid leg.
  - **Verified end to end against a fresh real deposit**, not a
    reused one: tx
    `0x438533caaa67710c2fe41f60b0018a392c86cde4c5d7745937e8d94483c2b681`
    on Robinhood Chain Testnet (1.01 USDG), confirmed via a disposable
    read-only script against the live `DATABASE_URL` -- a real
    `LedgerEntry` with the matching `txHash`, DID
    (`did:privy:cmsn52rxu02ye0cl11k3aqoy0`), and amount, not inferred
    from the 200 response alone (the hook's failure mode is
    specifically silent, see above). A stale script from the PR #5
    session, still sitting under a similar filename, briefly returned
    an `already-credited` result for the *wrong*, week-old tx --
    caught by checking the actual `txHash` in the row rather than
    trusting the status string. Both scratch scripts deleted before
    merge.
  - **Production confirmed serving the merge**: `vercel inspect
    hoodstack-tawny.vercel.app --logs` shows `Commit: 1922147`,
    matching `main`'s real merge commit -- not just a "Ready" label.
- **`services/settlement`'s docs corrected to describe what's real, not
  what was planned** (PR #8, `docs/fix-settlement-description`, squash-
  merged to `main` as `9dcddad`). `architecture.md` and
  `x402-payment-architecture.md` previously described `services/settlement`
  as a background worker; both now correctly describe it as a
  reconciliation module invoked synchronously via
  `resourceServer.onAfterSettle(...)`, per PR #7's actual implementation
  (see above). The withdrawal-flow section is now flagged as design-only,
  not yet validated against this real pattern. Closes out the item raised
  at the top of this file's Next Up section for two sessions running.
- **MockUSDT confirmed to have neither EIP-3009 nor EIP-2612 `permit`,
  and Permit2's real EIP-712 domain verified live on BSC Testnet.**
  Read `contracts/mock-usdt/src/Counter.sol` directly rather than
  assuming -- it's a bare OpenZeppelin `ERC20`, so the BSC deposit path
  has no domain of its own to check and must go through Permit2.
  Permit2's actual domain-separator formula pulled from Uniswap's real
  `EIP712.sol` source (`name: "Permit2"`, deliberately no `version`
  field, unlike most EIP-712 domains) and reproduced locally with viem
  against chain ID 97 -- matched the live on-chain `DOMAIN_SEPARATOR()`
  byte-for-byte
  (`0x4b0ae55c3d01d102f0a8e756724fe8f86b39420717f3217a9a35504cbfdf4553`),
  confirmed programmatically, not eyeballed. Resolves the open question
  about MockUSDT/EIP-3009/Permit2 below. Still unbuilt: the facilitator's
  ERC-20 Approval Gas Sponsorship path that actually uses this domain for
  the one-time approval (see Next Up).

## In Progress

- None

## Next Up

1. Real house treasury custody decision. `HOUSE_TREASURY_ADDRESS` is
   currently a disposable test address set only in local
   `.env.local` -- it is NOT a custody answer and must not reach a
   real deployment as-is.
2. Build and test the facilitator's ERC-20 Approval Gas Sponsorship
   path for BSC deposits. Confirmed this session: `MockUSDT` is a
   bare OpenZeppelin `ERC20` (read directly from
   `contracts/mock-usdt/src/Counter.sol`) -- no EIP-3009, no
   EIP-2612 `permit`, no domain of its own. The BSC deposit path
   must go through Permit2, exactly as `x402-payment-architecture.md`
   already assumed, but the facilitator-sponsored one-time approval
   this requires hasn't been built or tested. Permit2's own domain is
   now verified live on BSC Testnet (see Completed), so this is
   unblocked to start.
3. Decide: keep or strip the temporary `[http]` request logger in
   `facilitator/index.ts` -- now merged to `main` as-is; still an open
   decision, not blocking anything.
4. Fix the embedded-wallet chain-switch bug: Privy's
   `defaultChain: robinhoodChainTestnet` did not actually put a fresh
   embedded wallet on Robinhood Chain Testnet -- it showed `Network: 1`
   until manually switched via the wallet debug panel. A real player
   would silently hit this.
5. Fix the React "missing key prop" console warning (likely the
   wallet debug panel mapping `supportedChains` without a `key` --
   not confirmed).
6. Port the reference repo's Coinflip UI onto the wallet layer.
7. Port the landing/lobby mockup (`hoodstack-landing-mockup.html`)
   into real `src/app/(marketing)` components against HeroUI --
   still gated behind `find src/app -maxdepth 2 -type d` to confirm
   whether `(marketing)` already exists and what the root layout
   looks like, flagged three sessions ago and still never run.
8. Deploy the facilitator (committed and pullable from git) -- and
   later Socket.io (game state and the newly architected chat
   feature) -- to the VPS. Needs a domain or `sslip.io` wildcard DNS
   first. `services/settlement` does NOT belong on this list -- it
   runs inline inside the Vercel-deployed Next.js app, not as a
   separate VPS worker (`architecture.md` and
   `x402-payment-architecture.md` now describe this correctly, see
   Completed). Chat itself is fully scoped with two decisions locked
   (wallet-prefix usernames, auto-delete retention, see Completed)
   but has no code yet -- blocked on this same step.
9. Add `PRIVY_APP_SECRET` to Vercel once server-side Privy lookups
   (like the wallet-address-to-DID lookup) are needed in
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
- Is chat moderation a compliance requirement in the target
  jurisdictions, not just a UX nicety -- real-money chat carries
  harassment, public outcome disputes, and off-platform payment
  solicitation risk. Same jurisdiction dependency as the licensing
  question above; surfaced during this session's chat architecture
  research, not yet answered either way.
- Which linked address's prefix becomes a player's default chat
  username when a Privy DID has both an embedded and an external
  wallet? Small in scope but unresolved -- flagged when the
  wallet-prefix username decision was locked in.

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

## Session Notes (cont. 5)

- **Supabase abandoned for hosted Postgres**: the account had already
  used both free-tier project slots. Neon picked as the replacement
  after confirming (against Neon's own current docs, not third-party
  pricing aggregators) its free tier allows up to 100 projects --
  functionally no constraint for this project's needs.
- **Neon CLI (`neonctl`) used end to end** instead of the dashboard:
  `neon auth` for browser-based OAuth, `neon connection-string
  --project-id dawn-dawn-53245798 [--pooled] --prisma` for both
  connection strings. `--prisma` appends `connect_timeout=30`, which
  Prisma's docs recommend to avoid client-side timeouts on Neon's
  scale-to-zero cold starts.
- **No adapter swap needed for Neon.** `@prisma/adapter-neon` (Neon's
  serverless driver) is only required on edge runtimes; this app runs
  standard Next.js serverless functions on Vercel, so the existing
  `@prisma/adapter-pg` + `pg` setup from the Supabase/local-Postgres
  work applies unchanged -- only the connection string values differ.
- **Verified the actual production credential, not just the CLI's
  claim.** `prisma migrate deploy` reporting success only proves the
  migration ran against whatever URL was passed inline. Separately
  ran a disposable script (`scripts/verify-neon.ts`, deleted after)
  against the *exact* pooled `DATABASE_URL` now stored in Vercel,
  confirming a live `$queryRaw` round-trip and reading back
  `20260811105405_add_ledger_entry`'s real `finished_at` timestamp
  from Neon's `_prisma_migrations` table.
- **`pg` driver SSL deprecation warning noted, not a current issue**:
  `pg-connection-string` warns that `sslmode=require` will change
  semantics in a future major version (`pg` v9) to match libpq exactly.
  Current behavior is the *stronger* `verify-full`-equivalent, so no
  action needed now -- worth revisiting if `pg` is ever bumped to v9.

## Session Notes (cont. 6)

- **saaspo.com/templates turned out to be 46 curated paid templates**,
  not general design inspiration -- the broader site (3097 pages,
  filterable by industry/style) is a separate, larger set of real
  company sites. Neither `web_fetch` nor image search could produce
  actual visual confirmation of any specific template's colors or
  layout; template names and meta-descriptions are not a substitute
  for seeing the real render. Worth remembering for future design
  research on this project: ask for screenshots early rather than
  reasoning from text descriptions of visual work.
- **`tsconfig.json`'s `include` had no `src/` scoping** (`"**/*.ts"`
  matches the whole repo) going into tonight -- this is what let
  `facilitator/`'s code get swept into Next's type-check once the
  directory was committed. Worth a general watch-out: anything new
  added to repo root that isn't meant to be part of the Next.js app
  needs an explicit `tsconfig.json` exclude entry, not an assumption
  that `src/` scoping already handles it.
- **The root `.gitignore`'s `.env*` pattern is broad enough to catch
  `.env.example` files as collateral**, even though those hold no real
  secrets and are meant to be committed. `git check-ignore -v <path>`
  is the fast way to confirm which rule is actually matching before
  deciding whether `git add -f` is safe.
- **A "Production, Building" entry in `vercel ls` moments after a
  branch push doesn't necessarily mean the alias is confused or a
  stale deployment is showing** -- Vercel kicks off a fresh Production
  deployment the instant a PR merges to `main`, and if that merge
  happens close in time to unrelated branch activity, `vercel ls` can
  show both at once in a way that looks alarming at a glance. The fix
  is always the same: check the actual commit in the build log
  (`vercel inspect <url> --logs | head -8`) before concluding anything
  is wrong. This is the same category of confusion as the original
  PR #5 scare from a prior session -- never fully confirmed then, but
  consistent with this same explanation in hindsight.

## Session Notes (cont. 7)

- **Unexplained large diff arrived via `git pull` on `main`, not from
  this session's branch**: ~11,000 lines across `.agents/skills/prisma-*`,
  `.claude/skills/prisma-*`, `.windsurf/skills/prisma-*`,
  `skills-lock.json`, and a `package.json`/`package-lock.json` bump --
  none of it touched by `feat/settlement-ledger-wiring`. Likely a
  skill-catalog auto-install (Prisma reference skills) landing
  directly on `main`, not authored by this session or its branch.
  Didn't break the build and is orthogonal to tonight's work, but
  worth confirming the source before it's a surprise later -- if it
  wasn't an intentional install, it bypassed the branch -> PR ->
  CodeRabbit flow used for everything else.
- **`architecture.md` / `x402-payment-architecture.md` need a real
  correction, not just an update** (see Next Up item 6):
  `services/settlement` was documented as a background worker; what
  got built and merged is a synchronous in-request hook. Logged
  rather than fixed tonight, to avoid scope creep at the tail of an
  already long session.
- **Edit-first placeholder commands need to look different from real
  ones**: a command meant to be edited before running (e.g. `echo
  'KEY="paste-the-key-here"' >> .env.local`) formatted identically to
  every other copy-pasteable command in the same reply got run
  verbatim, landing the literal placeholder in `.env.local` and
  costing a debugging round-trip. Edit-first instructions need to be
  visually distinct from runnable commands, not just worded as an
  aside.
- **This close-out itself needed two retries**: the first two attempts
  to update this file were built from a remembered/assumed version of
  its content (partly from a cross-session memory digest, which uses
  a different section structure than this file actually has -- e.g.
  no "## Key learnings & principles" heading exists here). Both
  aborted safely on a mismatched anchor rather than writing anything
  wrong, but the fix was to have the real file's content pasted fresh
  and reconstruct it (with overlap verified programmatically, not
  eyeballed) before touching it again.
