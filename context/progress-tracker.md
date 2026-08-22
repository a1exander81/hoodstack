# Progress Tracker

## Current Phase

- **Most recent state (read this first; every bullet below predates
  it).** Crash's build continues under the same 4-milestone plan.
  Milestone 1 MERGED as `7a4cb74` (PR #19) and Milestone 2 MERGED as
  `a77eb08` (PR #21) -- `CrashRound`/`CrashBet`, `services/games/crash.ts`,
  and `placeCrashBet()`/`settleCrashBet()` are all now on `main`.
  `npm run build` passes on `main` post-merge.

  Both merges went through a REAL CodeRabbit review with genuine
  findings, not a rubber stamp -- this repo doesn't auto-review (under
  10 stars), so every review across both PRs required a manual
  `@coderabbitai review` trigger comment, and a good fraction of those
  triggers hit CodeRabbit's free-tier per-developer rate limit rather
  than actually running (see Session Notes cont. 17 for the full
  pattern, since it recurred a second time this session with PR #21
  itself). What each real review actually found and how it was
  resolved:
  - PR #19: `resolveCrashBet` trusted its inputs while `deriveCrashPoint`
    validated its own -- fixed (`672fa5b`) to reject non-integer/
    sub-1.00x multipliers and negative wagers, re-verified 24/24.
  - PR #21: two High-risk findings, both real. (1) `placeCrashBet`'s
    retry path treated ANY P2002 as "already placed" without checking
    the retried wager actually matched -- fixed to compare
    `existing.wagerMicroUsd` and throw a new
    `DuplicateBetWagerMismatchError` on mismatch. (2) `settleCrashBet`
    persisted a defensively-rejected cashout's `cashoutMultiplierBps`
    onto a bet marked LOST, indistinguishable from a genuine cashout
    attempt -- fixed to store `null` in that case. Also, applying
    CodeRabbit's own suggested P2002-matching diff would have been
    WRONG: it assumed `meta.target` holds field names, but probing a
    real duplicate insert under this project's actual Prisma 7.9.1 +
    `@prisma/adapter-pg` combination showed `meta` is `{ modelName:
    'CrashBet', driverAdapterError }` with no `target` array at all --
    matched on `meta.modelName` instead, verified against the real
    error object rather than trusted from the review comment. Also
    fixed: raw Privy DID dropped from a rejected-cashout log line;
    `architecture.md` invariant 1 amended to document Crash's
    pre-settlement WAGER-debit exception (gated on an open, committed
    round, not a settled one -- no equivalent exists for the
    single-shot games). Re-verified 21/21. Both merges' "stale
    progress-tracker.md" findings were correctly NOT actionable within
    those PRs -- docs commits go direct to `main` per this project's
    own git-path rule, done separately each time.

  PR #20 (UI quick wins, independent of Crash) is STILL open and still
  has never received a real CodeRabbit review -- every trigger attempt
  across this entire session hit the rate limit, including ones sent
  hours apart and past the limit's own stated reset time. Left as an
  explicit, unresolved decision point rather than merged around the
  review: the person chose to merge #21 on the strength of its own real
  review while continuing to hold #20 for an actual review before
  merging it.

  Milestones 3-4 (the real-time round engine, the Crash page UI) are
  NOT started -- see Next Up.

- **Prior state, superseded by the bullet above.** Production's 401 is
  RESOLVED, confirmed live, not just inferred from the commit trail.
  Session sequence: `92ad8d7` added
  temporary instrumentation to `resolveAuthenticatedDid` (never logs
  the key itself -- length, newline presence, PEM header/footer,
  `errorName` only); `4902ffc` redeployed after correcting
  `PRIVY_VERIFICATION_KEY` in Vercel (the leading hypothesis from the
  prior session, now confirmed rather than assumed); `95dd403`
  reverted the instrumentation once it had done its job. `vercel logs
  hoodstack-tawny.vercel.app --json` then showed a real, recent
  request -- `GET /api/games/session` at 2026-08-22 00:41:07 PST --
  with `responseStatusCode: 200`. That request's log level is
  `error`, which reads alarming out of context: the message is a
  Node-level pg SSL-mode deprecation warning (`sslmode=prefer/
  require/verify-ca` being aliased to `verify-full`), unrelated to
  auth, coincidentally interleaved into the same log line by Vercel's
  collector. The route itself returned 200. `4c5962a` separately added
  a Coinflip link from the signed-in card on `/`, closing the
  "nothing links to `/games/coinflip`" gap (Next Up item 16) in the
  same session.
  **What this does NOT yet confirm:** whether a real deposit has
  settled against production/Neon since the key fix (the wager route
  succeeding is not the same claim as a deposit crediting), and
  whether the pg SSL-mode warning above is worth quieting via
  `uselibpqcompat=true&sslmode=require` on the Neon connection string --
  cosmetic, not a correctness issue, since the query still succeeded.

- **Prior state, superseded by the bullet above.** The wager path is
  real, merged, and playable. A player picks a side; the route
  reserves a nonce against a commitment published BEFORE the bet,
  `services/games` derives the outcome from that round's float, and
  `services/ledger` moves the balance -- two rows on a win (`WAGER` +
  `PAYOUT`), one on a loss. `dev-stubs.ts` and the simulated-round
  banner are both deleted, so `Math.random()` no longer decides
  anything anywhere in the repo. Two real rounds settled against
  `hoodstack_dev` under commitment `d7fc78d2...`: nonce 1 a loss
  (-1000000), nonce 2 a win (-5000000 then +9900000, exactly 1.98x),
  with the derived balance landing at 9960000 and the UI reading
  $9.96. Three PRs merged that session: #14 (`22b3d36`) ledger entry
  point + schema + `services/games` + the house-edge decision, #15
  (`3b57e04`) lazy Prisma init, #16 (`c2be303`) the two routes and the
  Coinflip rewiring.
  **Production did NOT work at the time this bullet was written.**
  `/api/games/session` returned 401 on `hoodstack-tawny.vercel.app`
  for a user who was genuinely signed in (Privy `POST
  /api/v1/sessions` succeeded, embedded wallet resolved, app ID
  matched local). Local was fine end to end. Every deposit up to that
  point had settled through the local dev server, which is also why
  Neon's `LedgerEntry` was empty at the time -- the wager route was
  simply the first code that ever asked production's identity gate to
  verify a token. Resolved in the bullet above.

- **Superseded (the PR #12/#13 era, kept for the trail).** The first
  game and the provably-fair mechanism both exist.
  `src/app` is no longer `api/` + `dev/` only: an `(app)` route group
  holds a session-gated Coinflip page (PR #12), running on
  deliberately inert stubs -- a fixed balance that never decrements,
  bare `Math.random()`, and a permanent on-page banner saying exactly
  that. `services/rng` is built, merged (PR #13), and migrated to BOTH
  databases: seed-pair commit/reveal, verified by 22 checks against
  real Postgres, including three rounds re-deriving to their exact
  reservation-time floats from a seed whose hash was published before
  any of them. Nothing connects the two yet -- no route calls
  `reserveRound`, no `GameRound` row is ever written, and no balance
  moves. That join is the wager path, and it is the first change to
  touch `services/rng` and `services/ledger` together, which is
  precisely why it did not ship alongside either.

- **Prior state, superseded by the bullet above.** Both deposit rails are verified end to end with real
  player-facing signers. The remaining deposit-flow work is UX, not
  mechanism: Privy's confirmation modals are now suppressed per-call
  (`uiOptions.showWalletUIs: false`) rather than app-wide, with the
  Permit2 witness signature proven headless by a real settled deposit
  at zero modals and the ERC-20 approval prompt still untested (that
  leg never ran -- allowance already `maxUint256`). Headless signing
  has no app-level confirmation in front of it and cannot have one
  yet: there is no player-facing deposit UI at all. `src/app` still
  holds only `api/` and `dev/`. The largest unstarted chunk of the
  whole product remains the games -- Coinflip, Crash, Mines, Roulette
  are still at zero code, and the deposit rail is no longer a
  technical reason for that.

- Build stage -- wallet layer, x402 deposit route, self-hosted
  facilitator, and `services/ledger` (deposit-credit only, PR #5
  merged) are all built and verified end to end: a real signed deposit
  settled on Robinhood Chain Testnet and credited into the ledger
  against a real local Postgres database, with idempotency proven via
  a retried credit attempt. Production's database, the production
  domain's currency, and `facilitator/` being untracked are all
  resolved (see Completed). `creditDeposit()` is now wired into a real call site
  (`services/settlement`, PR #7) and verified against a real settled
  deposit -- that gap from prior sessions is closed. **Both deposit
  rails are now verified end to end against real settled on-chain
  transactions**: Robinhood Chain/USDG via EIP-3009 (PR #7), and BSC
  Testnet/MockUSDT via Permit2 (this session, tx `0xffc1cb99...`,
  ledger entry `cmsr61q5o0000iwv9f0bz6dnu`, on-chain balances confirmed
  independently with `cast`). The BSC path required six separate
  root-caused fixes and a dev-only burner signer to drive at all --
  Rabby rejects `eth_signTransaction`, so no browser wallet currently
  tested can complete the Permit2 approval leg (see Completed).
  **`erc20ApprovalGasSponsoring` is now proven to genuinely fire**, not
  just wired: a fresh burner (confirmed at 0 BNB, 0 MockUSDT, 0 Permit2
  allowance beforehand) completed a real deposit (tx
  `0x8ea2f5201e...`, ledger entry `cmsrfbesm00006hv9xp2ob9d0`), with
  the sponsorship itself independently confirmed via the burner's
  on-chain nonce (0 -> 1), remaining native BNB, and Permit2 allowance
  (0 -> `maxUint256`) -- none reachable unless the facilitator
  genuinely topped up a zero-balance wallet first. **The player-facing signer question is now
  answered, and the answer is structural**: `eth_signTransaction` is
  refused by every injected browser wallet as a matter of policy, not
  as a Rabby quirk -- MetaMask closed it won't-fix
  (metamask-extension#3475) and other wallet implementers explicitly
  track it as "MetaMask refuse to add, we should follow them." No
  injected wallet will ever complete the Permit2 approval leg, so BYOW
  on BSC is permanently off this rail and needs either a
  pre-fund-then-`eth_sendTransaction` design or explicit exclusion.
  Privy EMBEDDED wallets DO sign raw transactions (through Privy's own
  RPC, not an injected provider -- confirmed by reading the compiled
  `@privy-io/react-auth` source), and an embedded wallet
  (`0xEC11f1Cb1B8c5EE82E99019B1a0Bd2A302ce5077`) already exists on the
  canonical DID. **The BSC rail is now verified end to end with a real
  player-facing signer.** The Privy embedded wallet completed a real
  deposit (tx `0xc394003b...`, credited to
  `did:privy:cmsmrt71l00a80ckz455i9ha2`), sponsored from a genuine zero
  BNB balance. The facilitator's nonsensical `requiredWei` was
  root-caused to a double-hex-encoding bug in our own adapter, not in
  Privy's signing path (see Completed). Every BSC deposit before this
  one rode the dev-only burner. A
  landing/lobby mockup exists (not yet ported into real components) and
  the chat feature is fully architected with two decisions locked, but
  neither is built.

## Current Goal

- **The next unit is Crash Milestone 3: the real-time round engine.**
  Milestone 2 (PR #21) is built, verified, and open, branched cleanly
  off `main` after Milestone 1 (PR #19) merged -- do not repeat that
  mistake in reverse: don't start Milestone 3 by branching off an
  unmerged Milestone 2. A standalone server on `facilitator/`'s template
  (own `package.json`, `tsx`-run, hard-fail env validation) hosting
  Socket.io -- nothing real-time is installed anywhere in the repo
  today (confirmed by grepping `package.json`/`package-lock.json`/
  `node_modules` end to end; `architecture.md`'s "Socket.io"/"Redis
  (ioredis)" lines are aspirational stack docs only). Recommend
  verifying it as a local `tsx`-run process first, deploying only once
  proven -- exactly how the facilitator itself was built, and the
  facilitator STILL has never been deployed anywhere despite a VPS
  user/SSH key existing (Hostinger; no domain purchased). Concretely,
  this milestone must: generate a fresh `CrashRound` (server seed +
  hash, `deriveCrashPoint` from the committed float) and hold the crash
  point PRIVATELY in the engine's own memory/state from round start
  (never written to `CrashRound.crashMultiplierBps` until the round
  actually crashes -- see that column's corrected schema comment);
  drive `BETTING -> RUNNING -> CRASHED` transitions via the same
  guarded compare-and-swap `UPDATE ... WHERE status = <expected>` shape
  Milestone 2's verification script used, not a bare update; broadcast
  the commitment before betting opens and the live multiplier while
  running; call `placeCrashBet()`/`settleCrashBet()` at the right
  moments; and authenticate the socket connection via a
  socket-adapted `resolveAuthenticatedDid` (transport-agnostic already;
  reconnect/expiry handling is new, not new Privy plumbing).

- **RESOLVED -- production's 401 is fixed and confirmed live.** The
  hypothesis this section previously flagged as UNCONFIRMED --
  `PRIVY_VERIFICATION_KEY` losing its line breaks in Vercel -- was the
  real cause. Fixed by re-entering the correct multi-line PEM value in
  Vercel (`4902ffc`), with instrumentation (`92ad8d7`, key length +
  newline presence only, never the key) added first and removed after
  (`95dd403`) once it had served its purpose. Confirmed not from a
  green deploy but from a real request: `vercel logs
  hoodstack-tawny.vercel.app --json` shows `GET /api/games/session`
  returning `responseStatusCode: 200` at 2026-08-22 00:41:07 PST. The
  next real unit here is verifying a live deposit settles against
  production/Neon post-fix -- that still hasn't been directly observed,
  only the game-session route succeeding.

- The `erc20ApprovalGasSponsoring` gap flagged at the top of this
  file is now closed: a genuinely fresh burner (verified at 0 BNB, 0
  MockUSDT, 0 Permit2 allowance beforehand) completed a real BSC
  deposit, and the sponsorship mechanism itself -- not just the
  deposit settling -- was independently confirmed via on-chain state
  deltas (nonce, native balance, allowance), not inferred from a 200
  response (see Completed). What's still a real, unresolved gap: no
  browser wallet tested can complete the BSC approval leg, so the
  Permit2 rail currently has no viable player-facing signer at all --
  only the dev-only burner. **That investigation happened this
  session and produced a real answer** (see Completed): no injected
  wallet can ever do this, and Privy embedded wallets can. The
  embedded signer is built, type-checks clean, and produces both the
  Permit2 witness signature and the ERC-20 approval signature through
  Privy's UI.

- **Correction to the line above, from a later session:** the witness
  signature no longer goes "through Privy's UI" -- it is now headless
  via a per-call `uiOptions.showWalletUIs: false`, proven by a real
  settled deposit with zero modals (see Completed). The approval
  signature's prompt is UNTESTED: that leg never ran, because the
  wallet used already held a `maxUint256` Permit2 allowance.

- **RESOLVED -- the `requiredWei` blocker is closed, and the BSC rail
  now has a working player-facing signer.** Root cause was in our own
  `privyToClientSigner`, not Privy: the gas limit was pre-hex-encoded
  to the string `"0x11170"` (70000, the SDK's hardcoded
  `ERC20_APPROVE_GAS_LIMIT`), and Privy re-encoded that STRING's UTF-8
  bytes as hex, yielding `0x30783131313730` = 13642951556151088.
  Multiplied by a perfectly correct `maxFeePerGas` of 1e8, that is
  exactly the observed 1.36e24. Fixed by passing the gas limit as a
  plain JS number while leaving the fee fields hex-encoded -- Privy
  forwards those untouched, which is why they were always right.
  Verified in the facilitator log (`gas=70000 maxFeePerGas=100000000
  requiredWei=7000000000000`) and then by a settled deposit (see
  Completed).
  **Two claims previously recorded in this section were wrong**, and
  are corrected here rather than deleted: the bad value did NOT
  originate inside Privy's signing path, and the byte-identical result
  from sending both `gas` and `gasLimit` did NOT falsify the adapter
  hypothesis -- both fields were double-encoded identically, so that
  experiment could never have distinguished them.
  Now that sponsorship is proven to genuinely spend the gas wallet's
  real BNB, the missing rate limit / auth gate on that top-up matters
  more than it did as a theoretical risk -- anyone who can produce a
  validly-signed MockUSDT approval can trigger a real spend today.
  **RESOLVED: the 46630-vs-97 discrepancy.** Root cause was
  a signer/chain coupling bug in `/dev/x402-test`, not a flaw in the
  `networks` scoping itself: `networks` was derived from wagmi's
  connected `chain` even when the offline burner signed, and fell back
  to `undefined` -- which registers an `eip155:*` wildcard and makes
  `selectPaymentRequirements` take `accepts[0]`, always
  Robinhood/46630. Fixed by deriving the network from the chosen
  signer. Verified against a real facilitator log: every `/verify` in
  the run carried `network: 'eip155:97'`, with no 46630 attempt at
  all, versus the prior session's first-attempt-then-fall-through. Otherwise: the older candidates still stand -- port the
  landing/lobby mockup into real `src/app/(marketing)` components, get
  a domain in front of the VPS, and settle the real house treasury
  custody question.

## Completed

- **Crash Milestones 1 AND 2 both built, CodeRabbit-reviewed with real
  findings fixed, and MERGED.** Milestone 1: `7a4cb74` (PR #19).
  `resolveCrashBet` trusted its own inputs while `deriveCrashPoint`
  validated its -- fixed (`672fa5b`) to reject non-integer/sub-1.00x
  multipliers and negative wagers before merging, re-verified 24/24.
  Milestone 2: `a77eb08` (PR #21, branch `feat/crash-ledger-entrypoint`).
  `placeCrashBet()` and a unified `settleCrashBet()` (one function for
  both a live cash-out and the round-end loss sweep), each row-locking
  the specific `CrashRound`/`CrashBet` to close the real races involved
  (a bet landing after betting closes; a cash-out racing the round's
  own crash) -- no new advisory-lock scheme needed, a per-row
  `FOR UPDATE` closes both. Also corrected Milestone 1's
  `crashMultiplierBps` schema comment: null-until-CRASHED is an
  API-exposure safety net, not evidence the system doesn't know the
  crash point sooner -- the round engine holds it privately from round
  start. CodeRabbit's real review of #21 found two genuine High-risk
  gaps, both fixed (`b6c0b41`) before merge: `placeCrashBet`'s retry
  path accepted a MISMATCHED wager as an idempotent duplicate --
  fixed with a new `DuplicateBetWagerMismatchError`; `settleCrashBet`
  persisted a rejected cashout's multiplier onto a bet marked LOST --
  fixed to store `null` in that case. CodeRabbit's own suggested P2002
  fix (matching on `meta.target` field names) was verified WRONG
  against a real duplicate insert under this project's actual Prisma
  7.9.1 + `@prisma/adapter-pg` combination (`meta` here has no `target`
  array, only `modelName`) -- matched on `meta.modelName` instead, the
  correct fix, not the suggested one. Verified via a disposable
  `scripts/verify-crash-ledger.ts` (deleted after use, run twice): 21/21
  checks against real local Postgres, including a best-effort
  concurrent cash-out-vs-sweep test honestly caveated (`Promise.allSettled`
  doesn't guarantee overlap). `npm run build` passes on `main`
  post-merge.

- **Crash Milestone 0 + 1 built (superseded above once Milestone 1
  merged) and an independent UI/UX quick-wins pass shipped (PR #20,
  still open -- see Session Notes cont. 17 for the CodeRabbit rate-limit
  snag).** Full detail in Current Phase above; summary with the
  commit/PR references for quick lookup:
  - Milestone 0 (docs decision, `4ab0b64`, merged direct to `main`):
    `architecture.md` invariants 1+2 amended to describe Crash's
    house-level, per-round commitment (`CrashRound`, not `SeedPair`)
    and the deliberate inertness of the player's client seed for this
    one game; `project-overview.md` cross-referenced.
  - Milestone 1 (`feat/crash-round-model`, `875265b`, PR #19): new
    `CrashRound`/`CrashBet` Prisma models, new `LedgerEntry.crashBetId`
    FK (`onDelete: Restrict`, confirmed against real generated SQL);
    `services/games/crash.ts`'s `deriveCrashPoint`/`resolveCrashBet`,
    pure functions verified via a disposable, now-deleted
    `scripts/verify-crash.ts` -- ~200k simulated draws confirming the
    recorded 1% instant-bust rate and ~0.99 expected return across six
    cashout targets, boundary/unit cases, and two live-Postgres
    delete-restrict checks. Migration applied to local
    `hoodstack_dev`; `npm run build` passes.
  - UI quick wins (`fix/coinflip-ui-quick-wins`, `c83aa5c`, PR #20,
    independent of Crash): on-brand login hero copy; debug wallet panel
    collapsed behind an `<details>` "Advanced" disclosure; round
    history shows per-round nonce and a working copy-hash button;
    losses show their real signed amount in muted tone instead of
    `state-error` red; bet panel sticky to the viewport bottom on
    mobile. Verified live against a real signed-in dev session (DID
    `did:privy:cmsmrt71l00a80ckz455i9ha2`) with two real Coinflip
    rounds settled during verification (nonce #4 loss, nonce #5 win),
    confirming both the styling and that the wager path still works.

- **The wager path built, merged, and verified end to end** -- three
  PRs, in dependency order.
  - **PR #14** (`feat/wager-ledger-entries`, squash-merged as
    `22b3d36`). Schema: `LedgerEntryType` gains `WAGER`/`PAYOUT`;
    `asset`/`chainId`/`txHash` relaxed to nullable (deposit-only
    fields) with the zod boundary still requiring all three for
    deposits; `gameRoundId` added as a nullable FK with
    `onDelete: Restrict`. Prisma generated `ON DELETE SET NULL` by
    default, which would have silently orphaned ledger rows carrying
    real money -- corrected in the schema rather than by hand-editing
    the migration SQL, so a regeneration cannot lose it (the lesson
    from `SeedPair_userId_active_key`).
    `settleInstantRound()` is the new entry point: `GameRound` row plus
    one or two `LedgerEntry` rows in ONE transaction under
    `pg_advisory_xact_lock(hashtext(userId))`. The lock is
    load-bearing -- `aggregate()` takes no locks, so a read-then-insert
    balance check lets two concurrent bets both pass. Idempotency comes
    from `GameRound`'s existing `@@unique([seedPairId, nonce])`, not a
    new column: `reserveRound` already claims each nonce atomically.
    Two rows per winning round rather than one net row, deliberately --
    a net row destroys the ability to audit stake separately from
    return.
    `services/games` added as a NEW system boundary (documented in
    `architecture.md` and `code-standards.md` in the same PR): pure,
    deterministic resolvers with no database, no network, no app
    state. The ledger IMPORTS these to derive the payout
    authoritatively rather than trusting a caller-supplied figure.
    **Verified 34/34 against real local Postgres** via a disposable
    `scripts/verify-wager.ts` (deleted after use, refusing to run
    unless `DATABASE_URL` was local, and cleaning up every row it
    created): loss writes exactly one negative row; win writes two
    netting +0.98x; replayed `(seedPairId, nonce)` returns
    `already-settled` and moves the balance by zero; an over-balance
    wager throws `InsufficientBalanceError` leaving no orphan
    `GameRound`; two concurrent settles against a one-wager balance
    yield exactly one success; and all three rounds re-derive from the
    seed revealed at rotation. Caveat recorded honestly:
    `Promise.allSettled` cannot GUARANTEE the two transactions
    overlapped in Postgres, so the concurrency result is strong
    evidence rather than proof.
  - **PR #15** (`fix/lazy-prisma-init`, squash-merged as `3b57e04`).
    `src/lib/prisma.ts` called `createPrismaClient()` at module scope,
    so merely IMPORTING it threw when `DATABASE_URL` was unset. Next's
    "Collecting page data" step imports every route module without
    querying, which turned a missing Preview env var into a hard build
    failure the moment `services/ledger`'s barrel export gave the
    deposit route a path to the module. Fixed with a Proxy that
    resolves the client on first property access. Before/after proven
    on the same command: `DATABASE_URL= npx tsx -e 'import(...)'`
    threw `DATABASE_URL is not set` unpatched and printed
    `PASS: import succeeded` patched. 13 further checks against the
    real generated client covering delegates, tagged templates,
    interactive transactions, advisory locks and rollback.
  - **PR #16** (`feat/wager-route`, squash-merged as `c2be303`).
    `GET /api/games/session` publishes balance + commitment;
    `POST /api/games/coinflip` reserves, settles, responds. Identity
    comes from the Privy access token only, never the request body.
    **Invariant 2 is enforced rather than assumed**: the client must
    echo back the `serverSeedHash` it was shown, and a mismatch returns
    409 -- without that check `getActiveCommitment` would happily
    create a pair DURING the first bet, meaning the commitment and the
    round came into existence together. Balance is withheld until the
    coin animation lands so the number cannot spoil the outcome.
    `dev-stubs.ts` deleted, banner removed.
  - **Migration applied to BOTH databases and verified against each
    catalog, not against the command's success line.** Local: the nine
    pre-existing deposit rows kept their `asset`/`chainId`/`txHash`
    through the `DROP NOT NULL`. Neon (Postgres 18.4, so the
    two-`ALTER TYPE ADD VALUE` caveat in the generated SQL does not
    apply): enum reads `DEPOSIT`/`WAGER`/`PAYOUT`, the three columns
    read nullable, `gameRoundId` present with `ON DELETE RESTRICT`.

- **The 1% house edge recorded as a decision** (`74fc47b`, on the
  PR #14 branch). `project-overview.md` gains a `## House Edge`
  section: 1% uniform, applied through each game's own mathematics
  rather than one shared constant. Coinflip
  `COINFLIP_PAYOUT_BPS = 19_800` (1.98x); Crash 1% instant-bust at
  1.00x; Mines fair combinatorial payout x 0.99; Roulette 2.70%
  STRUCTURALLY, from a single-zero European wheel -- there is no
  multiplier to tune there, which is the whole reason this could not
  be one number. Payouts are quoted as total return including stake,
  not profit. The Coinflip constant did not change value; what changed
  is that it stopped being an invention and became a decision.

- **Context files corrected to describe the real stack: plain
  Tailwind, no component library** (`135234e`, direct to `main`).
  `architecture.md`, `ui-context.md`, and `code-standards.md` had all
  documented HeroUI as the component library since the project's first
  day; `package.json` has never contained `@heroui/*`, `src/components`
  held exactly one hand-written file, and both the login page and the
  landing mockup were built without it. `ui-context.md`'s Colors table
  also listed CSS custom properties (`--bg-base`) when the tokens are
  really `theme.extend.colors` keys in `tailwind.config.ts` consumed as
  `bg-bg-base` -- and `code-standards.md`'s styling rule pointed at the
  wrong mechanism to match. A fourth HeroUI reference sat in this
  file's own Next Up item 7, telling a future session to port the
  mockup "against HeroUI"; that was the one most likely to be acted on.
  Also added `state-error`/`state-success` to `tailwind.config.ts`,
  which `ui-context.md` had documented but the config never defined.
  Decision recorded rather than inherited: adding a component library
  later is fine, but as a deliberate choice on its own merits.

- **Coinflip UI built and merged** (PR #12, `feat/coinflip-ui`,
  squash-merged as `2a9c906`). Nine new files: an `(app)` route group
  with a session-gated layout, the game page, and four client
  components under `src/components/games/coinflip/`. First
  player-facing surface in the repo beyond the login page --
  `src/app` had held only `api/` and `dev/` for the project's entire
  life. Confirmed in the build's route table as `/games/coinflip`,
  static, 2.55 kB / 106 kB First Load (versus `/` at 882 kB, since
  nothing here pulls in the full wallet surface).
  - **Everything money-shaped is deliberately inert**, in one file
    (`dev-stubs.ts`) whose header says so. The table balance is fixed
    and never decrements -- a stub that debited on a loss would be
    indistinguishable from a working ledger at a glance, which is the
    exact thing invariant 1 exists to prevent. `resolveRound()` is
    bare `Math.random()` with no commitment. A permanent
    `state-error` banner on the page says "Simulated round · no seed
    commitment · no balance movement", chosen over a dev-only console
    warning specifically so it appears in any screenshot.
  - **`SessionGate` is a UX gate, not a security boundary**, and says
    so in its own docstring. Privy's hooks are client-only so it
    cannot run server-side; real enforcement stays in the route
    handlers, as `services/settlement`'s `verifyAccessToken` already
    does.
  - **Root-caused a real build config bug rather than working around
    it**: `tsconfig.json` was still on the Next scaffold's default
    `target: "ES2017"`, so every BigInt literal (`1_000_000n`) was a
    type error. Session Notes (cont. 4) logged this same error during
    the `services/ledger` build; it had been resolved then by writing
    `BigInt(0)` calls instead of fixing the target -- a workaround
    `code-standards.md` explicitly forbids layering. Now `ES2020`.
    The existing `BigInt(...)` calls in `services/ledger` and
    `services/settlement` were deliberately left alone: they are
    correct, and rewriting them means a PR on a protected path for
    zero functional gain.
  - **The payout multiplier is an invention, flagged as one.**
    `PAYOUT_BPS = 19_800n` (1.98x, 1% house edge) is a placeholder
    chosen to be visibly not-2.00x. No context file specifies a house
    edge for any game. Raised in Open Questions rather than left to
    harden into an accidental decision.

- **`services/rng` built, merged, and verified end to end** (PR #13,
  `feat/rng-commit-reveal`, squash-merged as `8e33feb`). Seed-pair
  commit/reveal: one server seed covers many rounds via an
  incrementing nonce, its SHA-256 hash published before any bet, the
  raw seed revealed only on rotation.
  - **Two invariants amended together, not one.** `architecture.md`
    invariant 2 was rewritten for the seed-pair model -- but invariant
    1 independently required "a settled game round with a revealed
    seed" before any balance mutation, which seed pairs cannot satisfy
    (reveal happens at rotation, after settlement). Amending only
    invariant 2 would have left the architecture forbidding every
    payout. Invariant 1 now reads "a published seed commitment", with
    the reason written inline.
  - **Model chosen deliberately, not defaulted into.** Per-round
    reveal satisfies a stricter reading of invariant 2 but makes the
    player's client seed inert, leaving nothing for
    `project-overview.md`'s Settings client-seed feature to manage.
    Seed pairs are also what existing third-party provably-fair
    verifiers implement, so players can check rounds with tools we did
    not write.
  - **A delimiter collision was found and closed before it shipped.**
    Deriving from `${clientSeed}:${nonce}` means a player-set client
    seed of `abc:1` at nonce 2 produces the same HMAC message as seed
    `abc` at nonce `1:2` -- two distinct rounds, identical
    derivations, with the colliding input entirely player-controlled.
    `:` is now rejected at the zod boundary and again inside
    `isValidClientSeed`, so the primitive is safe standalone.
  - **The nonce counter is an atomic `UPDATE ... RETURNING`**, not a
    read-then-write and deliberately not `COUNT(rounds) + 1`. Two
    concurrent bets would otherwise both read nonce N and derive
    identical outcomes. A count-based nonce silently reuses numbers
    whenever a round fails between reservation and insert, and looks
    correct in every test where nothing fails. A GAP in the sequence
    is harmless -- the skipped nonce is still derivable from the
    revealed seed, so a player can confirm nothing was hidden. A
    REUSED nonce is not recoverable. Same reasoning as the ledger's
    DB-level `txHash` idempotency.
  - **The partial unique index is hand-written SQL.** "At most one
    active seed pair per user" is `CREATE UNIQUE INDEX ... ON
    "SeedPair"("userId") WHERE "revealedAt" IS NULL` -- not
    expressible in Prisma schema syntax, so it was appended to the
    generated migration by hand after `migrate dev --create-only`. If
    that migration is ever regenerated the index disappears silently,
    and "which pair was this round under" stops having one answer.
    There is no `active` boolean: `revealedAt IS NULL` IS active, so a
    row cannot contradict itself.
  - **Verified against real Postgres, 22 checks, not from a type
    check.** A disposable `scripts/verify-rng.ts` (deleted after use,
    and refusing to run if `DATABASE_URL` pointed anywhere but local)
    proved: the commitment object has no `serverSeed` key; repeat
    calls return the same pair; `:` is rejected; three reservations
    yield nonces 1,2,3 with distinct floats in [0,1); `setClientSeed`
    is refused once nonce > 0; rotation reveals a seed whose hash
    matches the PRE-BET commitment; all three rounds re-derive to
    their exact reservation-time floats; the revealed pair is frozen
    at nonce 3; and exactly one active pair remains. The derivation
    itself was separately checked over 200,000 draws -- 0.49939 heads,
    strictly within [0,1).
  - **Migrated to BOTH databases.** `migrate dev` on `hoodstack_dev`,
    `migrate deploy` on Neon, with `SeedPair_userId_active_key`
    confirmed present in production via `pg_indexes` -- proof the
    hand-written SQL survived, rather than trusting the command's
    success line.

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
- **ERC-20 Approval Gas Sponsorship built and wired end to end**
  (`feat/erc20-approval-gas-sponsoring`, squashed and merged to
  `main`). Closes out Next Up item 2 below (rewritten, not removed --
  real-wallet testing is still outstanding, see below). Three separate
  SDK gaps found by reading the real installed `@x402/evm@2.21.0`/
  `@x402/core@2.21.0` compiled source, not assumed from docs, and
  confirmed against a live decoded 402 response, not just `tsc`:
  - `FacilitatorEvmSigner` (facilitator/index.ts's existing
    `buildSigner`) needed no changes -- `signTransaction`/
    `getTransactionCount`/`estimateFeesPerGas` belong to
    `ClientEvmSigner`, not the facilitator signer. Caught by `tsc`
    against the real installed types after an initial wrong guess.
  - `facilitator/index.ts` registers a new `FacilitatorExtension`
    under key `erc20ApprovalGasSponsoring`, implementing
    `sendTransactions` and `waitForTransactionReceipt`.
    `sendTransactions` decodes the client's pre-signed approval
    transaction (`parseTransaction`/`recoverTransactionAddress`) to
    get the exact gas cost and payer address, tops up the payer's
    native-token balance from the gas wallet only if short (capped at
    `MAX_GAS_TOPUP_WEI`, currently a guess grounded in the SDK's own
    `ERC20_APPROVE_GAS_LIMIT`/`DEFAULT_MAX_FEE_PER_GAS` constants, not
    a measured BSC Testnet gas price), broadcasts the approval, then
    broadcasts the settle transaction. Verified live: `/supported`
    lists `erc20ApprovalGasSponsoring` in its top-level `extensions`.
  - The route side needed real investigation, not assumption:
    `@x402/evm/exact/server`'s `ExactEvmScheme.enhancePaymentRequirements`
    looked like the obvious hook (it's literally passed
    `extensionKeys`) but its installed implementation is a no-op stub
    that discards them. The real mechanism, found by reading
    `@x402/core`'s compiled resource-server source directly, is
    `RouteConfig.extensions` (`Record<string, unknown>`, route-wide,
    not per-`accepts[]`-entry) -- `route.ts`'s `routeConfig` now sets
    `extensions: { erc20ApprovalGasSponsoring: true }`. Confirmed live
    by decoding a real 402 response: `extensions` now appears at the
    top level alongside `accepts[]`, matching the real `PaymentRequired`
    type exactly.
  - Not yet verified: whether declaring `extensions` route-wide is
    actually harmless for the Robinhood/USDG `accepts[]` entry (EIP-3009
    direct path, no Permit2 approval needed) -- expected to be a no-op
    there since the client's `trySignErc20ApprovalExtension` only fires
    within the Permit2-approval signing flow, but not independently
    confirmed against a real EIP-3009 deposit.
  - Gas-wallet top-up has no rate limit or authentication gate --
    unsafe for anything beyond testnet as-is: anyone who can produce a
    validly-signed MockUSDT approval (trivial, given `faucet()` is
    open) can trigger a top-up to any address today.
  - RESOLVED (next session): `/dev/x402-test`'s `ClientEvmSigner` was
    wired with `signTransaction`/`getTransactionCount`/
    `estimateFeesPerGas`/`readContract`, and the BSC/Permit2 deposit
    path settled end to end -- see the entry below.

- **BSC/Permit2 deposit path verified end to end.** tx
  `0xffc1cb99fa50ada79e5474520795982cdb90a397434bc97525c8d490c946d845`
  on BSC Testnet, 1.01 MockUSDT, payer
  `0xb8cf1A1189a3Bb16334808b795B44498D4e0B176` -> the disposable test
  treasury `0x13864051772FDFBce895d21a483eee02edaeB445`. Verified three
  independent ways, not from the 200 alone: facilitator's
  `[settle:after]` showed `result.success: true` with the tx hash;
  `services/settlement` logged `deposit credited -- ... entry
  cmsr61q5o0000iwv9f0bz6dnu`; and `cast call balanceOf` confirmed the
  burner at `3990000` (5.0 - 1.01) and the treasury at `1010000`, both
  matching to the atomic unit. Six separate bugs were root-caused to
  get here, every one by reading the installed packages' compiled
  source rather than docs or type signatures:
  - **`registerExactEvmScheme` with no `networks` option registers a
    `eip155:*` wildcard**, so `x402Client.selectPaymentRequirements`
    accepted every entry in `accepts[]` and took the first one --
    always Robinhood/46630, regardless of the connected chain.
    `ClientEvmSigner` carries no chain identifier at all, so nothing
    in that path could ever have read the wallet's real chain. This
    directly contradicts the note in Session Notes (cont. 3) claiming
    the client SDK "naturally matches whichever chain the connected
    wallet is actually on" -- that was never true as implemented.
    Fixed by passing `networks: [`eip155:${chain.id}`]`.
  - **The BSC `accepts[]` entry had no `extra` field**, so
    `ExactEvmScheme.createPaymentPayload`'s
    `extra?.assetTransferMethod ?? "eip3009"` defaulted MockUSDT (which
    has neither EIP-3009 nor EIP-2612) onto the EIP-3009 path, throwing
    "EIP-712 domain parameters (name, version) are required". Fixed
    with `extra: { assetTransferMethod: "permit2" }`.
  - **`readContract` was missing from the signer.**
    `trySignErc20ApprovalExtension`'s first line is
    `if (!capabilities.readContract) return void 0;` -- so the entire
    approval-sponsoring flow silently no-op'd, no error, no
    `signTransaction` call, and the payload went out with zero Permit2
    allowance. The facilitator then correctly rejected it with
    `412 permit2_allowance_required`.
  - **`RouteConfig.extensions` must be an object, not a boolean.**
    `validateExtensions` compares the advertised value against what the
    client echoes; `getExtensionInfo(true)` stays a raw boolean, and
    `objectContainsSubset(true, {...signed approval info...})` falls to
    `deepEqual(true, {...})`, which can never pass. The result was an
    empty-body 402 with *no server-side log at all* and no facilitator
    traffic -- rejected locally, before `/verify`. Fixed by changing
    `erc20ApprovalGasSponsoring: true` to `: {}` (equally truthy for
    the client's own check; vacuously true for the server's subset
    comparison). The old value's code comment explicitly reasoned that
    the value was "unused beyond truthiness by the client SDK" -- true
    of the client, wrong about the server.
  - **`.env.local` was corrupted by an `echo >>` append.** The burner
    key landed on the same physical line as `PRIVY_VERIFICATION_KEY`'s
    closing quote, because the preceding line had no trailing newline.
    Broke the multi-line PEM into an unparseable value -- surfaced as
    `TypeError: "spki" must be SPKI formatted string` and a 401 from
    the identity gate, several layers away from the real cause.
  - **Rabby rejects `eth_signTransaction`** with an internal reference
    to an unrelated public RPC URL and "unknown account", despite
    `transportType=custom` confirming the request reaches Rabby's own
    injected provider. MetaMask refuses the method outright
    (metamask-extension#3475, closed won't-fix). Worked around with a
    dev-only burner signer (see below), not solved.
- **Dev-only burner signer added to `/dev/x402-test`.** A
  `privateKeyToAccount` local signer, gated behind
  `NEXT_PUBLIC_BSC_TESTNET_BURNER_PRIVATE_KEY` (never committed) and a
  UI checkbox, signs fully offline in viem and bypasses the connected
  wallet entirely. This is the only reason a BSC deposit could be
  driven to completion at all, given the Rabby finding above. Testnet
  only, and it deliberately violates the "backend never holds private
  key material" invariant in `architecture.md` for a throwaway key --
  must not survive into anything player-facing.
- **BSC/Permit2 gas-sponsorship extension proven to genuinely fire,
  not just settle on a pre-existing allowance.** Prior session's
  successful BSC deposit rode a `maxUint256` Permit2 allowance already
  in place, leaving `erc20ApprovalGasSponsoring` itself unverified --
  flagged explicitly in Next Up. This session: generated a fresh
  burner (`0xC36b3ae41925d461664BDE96f2f2CE8E524C512D`) via
  `openssl rand -hex 32`, confirmed on-chain via `cast` at exactly
  0 BNB / 0 MockUSDT / 0 Permit2 allowance before touching it -- the
  genuine precondition the prior session's Next Up item called for.
  Funded MockUSDT only (never native gas) via the facilitator's own
  gas wallet, which self-minted 5.0 MockUSDT via `faucet()` then
  `transfer()`'d it to the burner -- the burner's native balance
  stayed at 0 throughout funding. Ran a real deposit through
  `/dev/x402-test` with the burner signer selected; settled on BSC
  Testnet, tx
  `0x8ea2f5201e82cfa92b2fc564340a2889e8ff64e725c2e95c698c7f765fab35ef`.
  Sponsorship itself confirmed independently via on-chain state
  deltas, not the facilitator's own success log: burner nonce
  0 -> 1 (only possible if it broadcast an approval, which it could
  only pay for if funded first), burner native BNB 0 -> a nonzero
  remainder (direct evidence of a top-up), and burner's Permit2
  allowance 0 -> `maxUint256` (confirms the broadcast tx was the
  approval it needed to be). `cast receipt` on the settle tx
  independently confirmed `status 1`, `to` =
  `0x402085c248EeA27D92E8b30b2C58ed07f9E20001` (the
  `x402ExactPermit2Proxy`), and the nested USDT `Transfer` log moving
  exactly 1,010,000 units. Ledger credit independently confirmed via a
  disposable script (`scripts/verify-bsc-sponsorship-ledger.ts`,
  deleted after use) querying `prisma.ledgerEntry.findUnique` directly
  by `txHash` -- real new entry `cmsrfbesm00006hv9xp2ob9d0`, crediting
  1,010,000 micro-USDT on `chainId` 97 to
  `did:privy:cmsmrt71l00a80ckz455i9ha2` (same DID as the prior
  session's BSC deposit, not a new split -- see Open Questions).
  Closes out Next Up item 2's core question for real.
  - **Discrepancy found, not yet resolved:** the facilitator log shows
    the client's *first* `/verify` attempt targeted
    `network: 'eip155:46630'` (Robinhood Chain) with a real signed
    EIP-3009 payload, despite the connected wallet reporting BSC
    (`eip155:97`) throughout -- rejected only because the burner has
    never held Robinhood-chain funds
    (`invalid_exact_evm_insufficient_balance`). Only the second
    `/verify`, for `eip155:97`, succeeded. This directly contradicts
    the claim in a prior session's fix that
    `networks: [eip155:${chain.id}]` fully scopes client-side
    selection to the connected chain -- either that scoping only
    affects requirement *preference*, not signature generation, or
    there's a fallback path through `accepts[]` still active. Not
    investigated further tonight; flagged for its own session.
  - **Gap noted, not fixed:** the facilitator's `sendTransactions`
    extension logs nothing about the top-up or approval broadcast
    itself -- proving sponsorship fired required reconstructing it
    from on-chain state deltas via `cast`, not reading a log line.
    Worth adding explicit logging so this is observable without a
    manual verification round-trip next time.

- **`eth_signTransaction` confirmed unavailable across the entire
  browser-wallet ecosystem -- not a Rabby bug.** Prior sessions logged
  Rabby's rejection as an unexplained quirk worth working around. It
  is policy: MetaMask closed the request won't-fix
  (metamask-extension#3475), and a third-party wallet's own
  method-support matrix lists the method with the note that MetaMask
  refuses to add it and they should follow suit. There is no browser
  wallet to switch to. This closes the "investigate Rabby's
  behavior" item as answered rather than pending, and makes BYOW-on-BSC
  a design decision (pre-fund + `eth_sendTransaction`, or exclusion)
  rather than a bug to fix.

- **Privy embedded wallets proven able to sign raw transactions**, by
  reading the compiled `@privy-io/react-auth` source rather than its
  types. Two internal paths, both real: the TEE/unified path calls
  Privy's RPC with `method: "eth_signTransaction"` and returns
  `signed_transaction`; the on-device path goes through
  `walletProxy.rpc({ request: { method: "eth_signTransaction" }})`.
  Neither touches an injected provider. The SAME source also confirms
  Privy simply FORWARDS `eth_signTransaction` to the injected provider
  for externally-connected wallets -- so Privy is no workaround for
  Rabby/MetaMask, and the embedded path is the only viable one.

- **Embedded wallet confirmed present on the canonical DID.**
  `useWallets()` reports both
  `rabby_wallet/injected 0xc2413696...` and
  `privy/embedded 0xEC11f1Cb1B8c5EE82E99019B1a0Bd2A302ce5077`. This
  mattered because `createOnLogin` is `"users-without-wallets"`, which
  skips provisioning for any DID that already linked an external
  wallet -- so no `createOnLogin` change is needed after all. Nothing
  in `src/` referenced `useWallets` or `walletClientType` before this
  session; the wallet debug panel is wagmi-only and cannot distinguish
  embedded from injected.

- **Privy embedded signer built** (`privyToClientSigner` in
  `/dev/x402-test`), alongside a three-way signer mode (connected /
  burner / Privy embedded) replacing the old burner checkbox. It
  drives BOTH Privy prompts to completion -- the Permit2 witness
  `signTypedData` and the ERC-20 approval `signTransaction` -- with a
  correct-on-inspection payload (Permit2 domain matching the
  on-chain-verified one, `spender` = the `x402ExactPermit2Proxy`,
  `witness.to` = the test treasury). Three real boundary hazards found
  and handled along the way, none visible to `tsc`:
  - **BigInt on the transaction path.** Privy's on-device wallet proxy
    JSON-serializes its request and `JSON.stringify` throws on BigInt;
    `@x402/evm` supplies bigints for `gas`/`maxFeePerGas`/
    `maxPriorityFeePerGas`. Hex-encoded at the adapter. The dev burner
    never hit this because `privateKeyToAccount` signs locally in
    viem, which takes bigints natively.
  - **BigInt on the typed-data path.** Same proxy, separate crossing --
    fixing only the transaction path left the crash identical. The
    Permit2 witness message carries bigints in `permitted.amount`,
    `nonce`, `deadline`, `validAfter`. Fixed with a recursive
    normalizer (EIP-712 numerics are valid as decimal strings) rather
    than field-by-field, after field-by-field had already missed some.
  - **`gasLimit` is NOT read by the on-device path.** Privy's TEE
    branch resolves `gas_limit: gasLimit ?? gas` and
    `gas_price: gasPrice ?? gas` (the latter would submit a gas LIMIT
    as a gas PRICE if `gas` leaked through); the on-device branch
    forwards the request object untouched and does neither. Sending
    both `gas` and `gasLimit` as hex produced a byte-identical
    facilitator error, so the bad gas value does NOT originate in our
    arguments. Unresolved -- see Current Goal.

- **`networks` scoping bug fixed and verified** (see Current Goal for
  the root cause). Confirmed against a real facilitator log showing
  every `/verify` on `eip155:97` with no 46630 attempt.

- **Opaque x402 failures are now readable.** An empty-body 402 with
  zero facilitator traffic had twice been diagnosed as "no server-side
  log at all." It was never silent: `processHTTPRequest` calls
  `createPaymentRequiredResponse(..., invalidReason, ...)` and the
  result travels in a RESPONSE HEADER, not the JSON body. The header is
  `payment-response` (base64 JSON), NOT `PAYMENT-REQUIRED` -- guessing
  the name cost a round-trip. `/dev/x402-test` now dumps every response
  header with its value and decodes the challenge, which is what
  finally surfaced the real error after several blind hypotheses.

- **`MAX_GAS_TOPUP_WEI` checked directly against a measured gas
  price**, closing the sub-question Next Up item 2 tracked. Value is
  `3_000_000_000_000_000` wei (0.003 BNB) at `facilitator/index.ts:132`;
  BSC Testnet gas price re-measured this session at 100,000,000 wei
  (0.1 gwei, unchanged from last session). A correct approval costs
  55,000 x 1e8 = 5.5e12 wei, giving ~545x headroom -- the cap would
  only bind above ~54 gwei. NOTE: an earlier session note recorded this
  cost as ~5.5e9 wei, which was wrong by 1000x. The cap is not a
  reliability risk; it is purely a spend-exposure question.

- **`src/app/(marketing)` confirmed NOT to exist**, running the check
  flagged three sessions running. `src/app` contains only `api/` and
  `dev/` -- no `(marketing)`, no `(app)`, no `games/`. The mockup port
  is greenfield with no layout to reconcile.

- **BSC/Permit2 deposit completed by a real player-facing wallet --
  the Privy embedded signer works end to end.** tx
  `0xc394003bebe63be31d8e11102993d62995ea66b641f1efc458bacd0575f49311`
  on BSC Testnet, 1.01 MockUSDT, payer
  `0xEC11f1Cb1B8c5EE82E99019B1a0Bd2A302ce5077` (Privy embedded, on the
  canonical DID) -> the disposable test treasury
  `0x13864051772FDFBce895d21a483eee02edaeB445`. Every prior BSC deposit
  rode the dev-only burner signer; this is the first that did not, so
  the Permit2 rail now has a viable player-facing path for the first
  time.
  - **Root cause of the 1.36e24 `requiredWei`: double hex-encoding in
    our own adapter, not Privy's internals.** `privyToClientSigner`
    hex-encoded every bigint at the boundary (the TRAP 3 BigInt/JSON
    fix from a prior session). For the fee fields that is correct --
    Privy forwards them untouched. For the gas limit it is not: Privy
    re-encodes that field with viem's `toHex`, which given a STRING
    encodes its UTF-8 bytes instead of passing it through. So
    `"0x11170"` became `0x30783131313730` = 13642951556151088 -- the
    ASCII of the bad value is literally the string we sent. The
    intended 70000 was read from the installed `@x402/evm@2.21.0`
    compiled source (`signErc20ApprovalTransaction` passes
    `gas: ERC20_APPROVE_GAS_LIMIT`), and the whole corruption was
    reproduced against real viem in a sandbox before the fix was
    written.
  - **Fix:** the gas limit now passes as a plain JS number (70000 is
    far below 2^53, so exact and JSON-serializable); fee fields
    unchanged as hex. A one-line behavioral change, type-checked clean.
  - **Decoded-transaction logging added to `sendTransactions`**
    (`facilitator/index.ts`), closing Next Up item 10. Dumps every
    decoded field via `JSON.stringify` with a bigint replacer, which
    sidesteps viem's `TransactionSerializable` union entirely rather
    than accessing fields that only exist on some transaction types.
    This logging is what root-caused the bug, in one read.
  - **Verified four independent ways, not from the 200.** (1)
    Facilitator log: `gas=70000 maxFeePerGas=100000000
    requiredWei=7000000000000`, then `result.success: true`. (2)
    On-chain deltas on the embedded wallet: nonce 0 -> 1, Permit2
    allowance 0 -> `maxUint256`, MockUSDT 5000000 -> 3990000. (3) `cast
    receipt`: `status 1`, `from` = the facilitator gas wallet, `to` =
    `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`
    (`x402ExactPermit2Proxy`), with a nested MockUSDT `Transfer` log of
    `0xf6950` = 1,010,000 units. (4) The gas arithmetic reconciles
    independently: top-up 7000000000000 wei minus leftover
    2282000000000 = 4718000000000, implying exactly 47,180 gas used
    against the 70,000 limit -- a figure unreachable unless the
    facilitator genuinely funded a zero-balance wallet first. Ledger
    credit confirmed via `psql hoodstack_dev`: matching `txHash`,
    `amountMicroUsd` 1010000, `chainId` 97, DID
    `did:privy:cmsmrt71l00a80ckz455i9ha2`.
  - **One log in the run shows the fix landing mid-file**: the first
    two `/settle` attempts carry `gas: "13642951556151088"` with an
    identical signature (a cached pre-hot-reload signed tx), and the
    third carries a fresh signature with `gas: "70000"`. Useful as a
    self-contained before/after if this is ever revisited.

- **Privy's confirmation modal suppressed per-call, not app-wide --
  witness signature proven headless, approval signature still
  untested.** Next Up item 11 framed `showWalletUIs` as a global
  toggle with two bad options: leave it true (two modals mid-deposit,
  one of which the player never initiated, both rendering raw EIP-712)
  or set it false app-wide (every embedded-wallet signature loses its
  confirmation surface forever, weakening `architecture.md`'s access
  model well beyond the deposit flow). Reading the installed
  `@privy-io/react-auth` showed the framing was wrong -- a per-call
  override exists:
  - `dist/dts/index.d.ts`: `usePrivy()`'s own `signTypedData` and
    `signTransaction` each take
    `options?: { uiOptions?: ...; address?: string }`. The adapter
    already passed `{ address }` as that argument, so this needed one
    key added per call site, not a hook swap.
  - `dist/dts/types-B_DvyjIb.d.ts`:
    `SignMessageModalUIOptions`/`SendTransactionModalUIOptions` both
    carry `showWalletUIs?: boolean`, documented as defaulting to (and
    therefore overriding) the Dashboard setting and the
    `embeddedWallets` config.
  - `dist/esm/solana.mjs`: Privy's own `signTransaction` and
    `signAndSendTransaction` pass
    `uiOptions: { ...opts, showWalletUIs: !1 }` internally to suppress
    a nested prompt, with app config left at its default -- so a
    per-call false is sufficient on its own, not ANDed with app
    config. (`isHeadlessSigning` is
    `u(be, [ee.embeddedWallets.showWalletUIs])`, called everywhere as
    `({ showWalletUIs: <per-call value> })`.)
  - **Verified empirically**: a real BSC deposit settled through the
    Privy embedded wallet
    (`0xEC11f1Cb1B8c5EE82E99019B1a0Bd2A302ce5077`) with ZERO modals,
    where the same wallet previously produced them. `showWalletUIs`
    remains unset in `app-providers.tsx` -- every other
    embedded-wallet signature keeps its prompt.
  - **What this does NOT prove, stated plainly**: `sendTransactions`
    never appears in the facilitator log for this run, so the ERC-20
    approval leg never executed -- the wallet's Permit2 allowance was
    already `maxUint256` from a prior session. Only `signTypedData`
    was exercised. The two calls take different option types down
    different internal branches, so this result does not carry to the
    approval prompt. Testing it needs an embedded wallet whose
    allowance is not already max, which means a fresh Privy embedded
    wallet on a new DID (the dev burner cannot test this -- it uses
    `privateKeyToAccount` and never touches Privy's UI at all).
  - **Prerequisite recorded, not satisfied**: headless signing removes
    the only consent surface the player sees. There is currently no
    player-facing deposit UI to put an app-level confirmation in front
    of it (`src/app` still holds only `api/` and `dev/`), so the
    constraint lives only in a code comment. See Architecture
    Decisions.

## In Progress

- None

## Next Up

1. Real house treasury custody decision. `HOUSE_TREASURY_ADDRESS` is
   currently a disposable test address set only in local
   `.env.local` -- it is NOT a custody answer and must not reach a
   real deployment as-is.
2. Add a rate limit / auth gate to the gas-wallet top-up before any
   further use beyond isolated testing. The gas-sponsorship top-up
   itself is now PROVEN to genuinely fire (see Completed) -- a fresh,
   verifiably-zero-balance burner completed a real deposit, confirmed
   via on-chain nonce/balance/allowance deltas, not just a facilitator
   success log. That closes the "does it even work" question this
   item previously tracked. What's left: the gas wallet
   (`0x3D02658E7eaB834875a0765D8CeC566b2eDc5ceA`) is a confirmed real
   spend today, and today anyone who can produce a validly-signed
   MockUSDT approval can trigger a top-up to any address -- unsafe for
   anything beyond isolated testnet use as-is. RESOLVED sub-question: `MAX_GAS_TOPUP_WEI` has
   now been read directly (`3_000_000_000_000_000` wei, 0.003 BNB) and
   compared against a re-measured 100,000,000 wei gas price -- ~545x
   headroom, not a reliability risk (see Completed). What remains here
   is purely the auth/rate-limit exposure, unchanged.
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
   into real `src/app/(marketing)` components with plain Tailwind --
   no longer gated: the check was finally run this session and
   `(marketing)` does NOT exist (see Completed), so this is greenfield
   directory creation with no existing layout to reconcile.
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
10. DONE -- decoded-transaction logging now exists in
    `sendTransactions` (`facilitator/index.ts`), and it is what
    root-caused the 1.36e24 `requiredWei` in a single read (see
    Completed). Keep it rather than stripping it after the fact: it is
    currently the only observability on a code path that spends real
    gas-wallet funds. Nothing on the BSC rail is blocking any more --
    the next real decision there is item 11.
11. PARTLY RESOLVED -- `showWalletUIs` is not a global toggle after
    all. A per-call `uiOptions.showWalletUIs: false` override exists on
    `usePrivy()`'s `signTypedData`/`signTransaction` and is sufficient
    on its own; it is now applied to both call sites in
    `/dev/x402-test`, with app-level config left unset so no other
    embedded-wallet signature loses its prompt (see Completed). The
    witness signature is proven headless by a real settled deposit
    with zero modals. What remains:
    - The ERC-20 approval prompt is UNTESTED -- that leg never ran
      (allowance already `maxUint256`). Needs a fresh Privy embedded
      wallet on a new DID to exercise; the dev burner cannot test it.
    - The app-level confirmation UI that must sit in front of headless
      signing does not exist and cannot exist yet -- there is no
      player-facing deposit UI at all. This is a hard prerequisite
      before headless signing reaches a player, not a nice-to-have.

12. DONE -- **the wager path shipped** across PRs #14 and #16 (see
    Completed). `reserveRound` is called, `GameRound` rows are
    written, balances move, `dev-stubs.ts` and the banner are gone,
    and two real rounds settled against `hoodstack_dev` with the
    arithmetic reconciling. What this did NOT cover: the same code
    returns 401 in production (item 14).

13. **Vercel Preview `DATABASE_URL` -- no longer a blocker, still
    absent.** PR #15's lazy Prisma init means a missing
    `DATABASE_URL` no longer fails the BUILD, and Preview deployments
    now go green without it (confirmed: the `fix/lazy-prisma-init`
    preview built clean while Preview still had no such variable).
    What remains is only the RUNTIME need -- any preview deployment
    that actually queries the database still requires it. Four
    attempts to set it failed tonight (see Session Notes cont. 15);
    the web dashboard remains the only path, and it is not urgent.

14. DONE -- **production's 401 is fixed and confirmed live.**
    `PRIVY_VERIFICATION_KEY` had lost its line breaks in Vercel;
    re-entered correctly (`4902ffc`), diagnosed via temporary
    instrumentation (`92ad8d7`, reverted in `95dd403` once it had
    served its purpose). Confirmed via `vercel logs
    hoodstack-tawny.vercel.app --json`: a real `GET
    /api/games/session` request returned `responseStatusCode: 200` at
    2026-08-22 00:41:07 PST. Since `services/settlement`'s deposit gate
    shares `resolveAuthenticatedDid`, this should also unblock
    production deposits -- NOT yet directly confirmed by a settled
    deposit against Neon, only by the game-session route succeeding.

15. **`/games/coinflip` First Load JS went 106 kB -> 865 kB.** The
    page's own bundle barely moved (2.55 -> 3.21 kB); `usePrivy`
    pulled the entire Privy client surface into what had been the
    lightest route in the app. It is now nearly as heavy as `/` at
    882 kB. Real regression, knowingly merged. The lighter shape is a
    slim token context or a server-side session read rather than the
    whole hook in the game bundle.

16. DONE -- **the signed-in card on `/` now links to
    `/games/coinflip`** (`4c5962a`). Still only one entry point into
    the game (this one link), which is fine at current scope but worth
    revisiting once more games exist -- a real per-game lobby is not
    built yet.

17. DONE -- **Merged PR #19 (Crash Milestone 1)**, `672fa5b` -> squashed
    as `7a4cb74`. CodeRabbit's real review (had to be manually
    triggered -- see Session Notes) found and this session fixed a
    genuine gap in `resolveCrashBet`'s own input validation before
    merge; see Current Phase for detail.

18. **Get PR #20 (UI quick wins) a real CodeRabbit review, then merge.**
    Still the only open PR in this whole Crash effort that has never
    received an actual review -- every trigger attempt has hit the
    shared per-developer rate limit (see Session Notes cont. 17). Not
    urgent (it's display/layout only, no money logic), but should not
    be merged around the gap the way #21 briefly was considered --
    wait for a genuine review this time.

19. DONE -- **Crash Milestone 2: two-phase `services/ledger` entry
    point, MERGED as `a77eb08` (PR #21).** `placeCrashBet()` /
    `settleCrashBet()` built, CodeRabbit-reviewed (two real High-risk
    findings fixed -- a wager-mismatch idempotency gap and a
    rejected-cashout persistence bug, see Current Phase), re-verified
    21/21, merged. `services/ledger`'s Crash surface is now complete for
    Milestones 1-2; Milestone 3 is next.

20. **Crash Milestone 3: the real-time round engine.** A standalone
    server on `facilitator/`'s template (own `package.json`, `tsx`-run,
    hard-fail env validation) hosting Socket.io -- nothing real-time is
    installed anywhere in the repo today (`architecture.md`'s
    "Socket.io"/"Redis (ioredis)" lines are aspirational stack docs
    only, confirmed by grepping `package.json`/`package-lock.json`/
    `node_modules` end to end). Recommend verifying it as a local
    `tsx`-run process first, deploying only once proven -- exactly how
    the facilitator itself was built, and the facilitator STILL has
    never been deployed anywhere despite a VPS user/SSH key existing
    (Hostinger; no domain purchased). A socket-adapted
    `resolveAuthenticatedDid` is needed for the handshake (the function
    itself is transport-agnostic already; reconnect/expiry handling is
    new, not new Privy plumbing).

21. **Crash Milestone 4: the Crash page UI.** Reuses Coinflip's existing
    3-column layout. Decide up front how to avoid repeating item 15's
    `usePrivy` bundle-bloat regression rather than shipping it a second
    time. Manual AND auto-cashout target from day one; cash-out as the
    largest, most reachable mobile control; explicit
    waiting/running/crashed/settled state, never inferred from color
    alone -- per the UI/UX research pass this session.

## Open Questions

- **RESOLVED: the house edge is 1% uniform, with Roulette at 2.70%
  structurally.** Recorded in `project-overview.md`'s `## House Edge`
  section (`74fc47b`) rather than left in a code comment. The reason
  it could not be a single constant is Roulette: its edge comes from
  the zero pocket (1/37), not from a payout haircut, so it cannot be
  tuned to 1% without changing the wheel. Coinflip's
  `COINFLIP_PAYOUT_BPS = 19_800` is unchanged in value and now
  documented as a decision.
- **RESOLVED: production's identity gate now works, confirmed live.**
  It had never successfully verified a token before this fix -- every
  prior deposit settled through the local dev server, which is why
  Neon's `LedgerEntry` was empty. Root cause was a malformed
  `PRIVY_VERIFICATION_KEY` in Vercel (lost line breaks); corrected and
  confirmed via a real `GET /api/games/session` returning 200 in
  production logs (see Current Phase). Still open: no deposit has been
  directly observed settling against Neon since the fix, only the
  session route succeeding -- worth a real deposit test before trusting
  this unconditionally for money movement.
- **Who has read access to the production database, and does that need
  restricting?** Server seeds sit in Postgres in plaintext until
  reveal, so read access to Neon is equivalent to knowing every
  unsettled round's outcome. This is inherent to the design -- the app
  must hold the seed to compute outcomes -- but it makes DB access an
  operational control, not just an infrastructure detail. Noted in
  `architecture.md` invariant 2 as well.

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
- **RESOLVED: `did:privy:cmsmrt71l00a80ckz455i9ha2` is the canonical
  test identity.** Queried `hoodstack_dev`'s `LedgerEntry` table
  directly with `psql`: every BSC deposit, including both from the
  Privy-embedded-signer session, credited that DID. There is no split
  on this database. `did:privy:cmsn52rxu02ye0cl11k3aqoy0` credited
  PR #7's Robinhood Chain verification and does not appear in the BSC
  entries -- so the two DIDs were never competing within one ledger,
  which is what "balance split across both" previously implied. The
  underlying Architecture Decisions point still holds (two
  separately-created DIDs are never auto-merged); it just was not
  causing the problem it appeared to.
- **Related correction, important for any future ledger check: local
  dev and production use DIFFERENT databases.** `DATABASE_URL` in
  local `.env` points at Homebrew Postgres
  (`postgresql://<user>@localhost:5432/hoodstack_dev`); `DATABASE_URL`
  in Vercel points at Neon. Same variable name, different target per
  environment. An entry's absence from one says nothing about the
  other, and any verification claim must name WHICH database it
  checked. This likely explains part of the PR #5-era stale-script
  confusion logged in Session Notes (cont. 4).

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

## Session Notes (cont. 8)

- **Splicing a verified sandbox reproduction into the real repo
  dropped its imports.** The `erc20ApprovalGasSponsoring` extension
  was type-checked clean in a full standalone sandbox file (imports
  included), but only the new *section* -- not the imports -- was
  spliced into the real `facilitator/index.ts`, on the assumption the
  real file's existing imports already covered the new code's
  dependencies. They didn't (`parseTransaction`,
  `recoverTransactionAddress`, `FacilitatorExtension` were all new).
  Caught immediately by a real `tsc --noEmit` against the actual repo,
  not silently shipped, but cost a second anchor-verified fix script.
  Worth a standing habit: when handing over a partial extract of a
  sandbox-verified file, explicitly diff its import list against the
  target file's real current imports before generating the splice,
  rather than assuming overlap.
- **`ExactEvmScheme.enhancePaymentRequirements` -- the obviously-named
  hook, given it's literally passed `extensionKeys` -- turned out to
  be a no-op stub in the installed `@x402/evm@2.21.0`.** Looked like
  the right integration point from its signature alone; reading the
  compiled `.mjs` (not just the `.d.mts`) showed it just discards the
  argument. The real mechanism, `RouteConfig.extensions`, was found by
  tracing `enrichExtensions`/`registerExtension` through `@x402/core`'s
  actual resource-server source. Same lesson as the `signTransaction`
  mix-up earlier the same session: a plausible-looking hook name in a
  `.d.ts` is not confirmation it's wired to anything -- check the
  compiled implementation, not just the type signature.
- **Facilitator-side gas sponsorship required real design work, not
  just wiring.** Broadcasting a pre-signed transaction doesn't make
  the broadcaster pay its gas -- gas is deducted from whoever signed
  it. Not obvious from the SDK's naming (`sendTransactions` on a
  `FacilitatorExtension`'s signer) until reading
  `settlePermit2WithERC20Approval`'s actual compiled implementation.
- Squashed and merged as its own branch
  (`feat/erc20-approval-gas-sponsoring`) rather than direct to `main`
  -- deliberate, given this touches the gas wallet's actual spending
  logic, matching the review bar `ai-workflow-rules.md` sets for
  `services/ledger`/`services/rng` even though this code doesn't
  technically live in either path.

## Session Notes (cont. 9)

- **Anchor mismatches from chat-pasted whitespace happened three times
  in one session** -- `route.ts`'s `extensions:` line (2-space indent,
  anchor built with 4), `route.ts`'s BSC `accepts[]` entry (same), and
  `page.tsx`'s `signTransaction` block (a `console.error` line from an
  earlier diagnostic pass that the anchor omitted). All three aborted
  safely with zero writes, exactly as designed -- but each cost a
  round-trip. Per closing ritual #5, third occurrence promotes this
  from a note to a standing rule: read the real bytes
  (`sed -n '/pattern/,/pattern/p'` or `cat -evt`) before building any
  anchor, never reconstruct one from a terminal paste earlier in the
  conversation. Chat transcription does not preserve leading
  whitespace reliably.
- **A silent local rejection can look exactly like a network failure.**
  The `extensions: true` bug produced an empty-body 402, no thrown
  client error, no server log line, and zero facilitator traffic --
  `processHTTPRequest` rejected it locally at `validateExtensions`,
  before `/verify`. Time was lost theorizing about transports and
  wallet internals. The diagnostic that actually worked: notice which
  log line is ABSENT (`handleSettlement`'s `console.error` never fired,
  so the failure was upstream of settlement entirely) and narrow from
  there.
- **Browser DevTools console was requested four times and never
  successfully captured.** `console.log` diagnostics were invisible;
  Next's dev error overlay only mirrors thrown errors, so
  `console.log` never surfaced anywhere the person could see it.
  What worked immediately: embedding the diagnostic INTO the thrown
  error's message, which lands in the page's own log panel. For this
  project, prefer thrown-error diagnostics over `console.log` --
  they reach the same place the person is already reading.
- **Multi-line values in `.env.local` are fragile.** `echo 'KEY=...'
  >> .env.local` appends without checking whether the previous line
  ended in a newline; here it welded the burner key onto
  `PRIVY_VERIFICATION_KEY`'s closing quote, silently corrupting a
  multi-line PEM. The error surfaced four layers away as an SPKI
  parse failure inside Privy's token verification. Check with
  `cat -evt` (BSD `cat` has no `-A`) after any `>>` append to a file
  holding multi-line values.
- **Two wallet extensions racing for `window.ethereum` produced a
  recurring `evmAsk.js "Cannot redefine property: ethereum"` error**
  that persisted across several attempted fixes and cost real time.
  Brave's built-in wallet injects independently of any extension and
  needs `brave://settings/web3` -> Default Ethereum wallet ->
  Extensions, plus a full browser restart. Worth settling this once
  per browser profile rather than re-diagnosing it mid-session.
- **Backslash line continuations don't survive chat copy/paste
  reliably.** A multi-line `cast send` lost its continuations, so zsh
  ran the first line alone (defaulting to `localhost:8545`, connection
  refused) and then tried to execute `--value`/`--rpc-url` as
  standalone commands. Prefer single unbroken lines for commands
  handed over in chat, however long.
- **Placeholder syntax needs to be unrunnable, not just labeled.**
  `BURNER=<paste the address>` was pasted verbatim; zsh read `<` as a
  redirect and threw a parse error. Same class as the Session Notes
  (cont. 7) lesson about edit-first commands looking identical to
  runnable ones -- the fix that works is making the placeholder
  syntactically obvious (`0xYOUR_ADDRESS_HERE`), not adding prose
  around it.

## Session Notes (cont. 10)

- **Funding a fresh burner with MockUSDT only (no native gas) needs a
  two-hop relay, not a direct call.** `faucet(uint256)` self-mints to
  `msg.sender` only (`_mint(msg.sender, amount)`), so a wallet with
  zero BNB can never call it directly. Worked around by having the
  facilitator's own gas wallet (already funded with testnet BNB)
  self-mint via `faucet()`, then `transfer()` the minted MockUSDT to
  the target burner -- the burner's native balance never moves during
  funding, preserving the "genuinely zero BNB" precondition a
  sponsorship test needs. Worth reusing this pattern for any future
  test account that needs MockUSDT without gas.
- **A `cat -evt` on a private-key `.env.local` line was proposed, then
  caught before running it** -- raw-byte inspection is useful for
  diagnosing corruption, but on a line holding actual secret material
  it would have printed the real key straight into chat. Regenerating
  a fresh key (already needed for this session's test anyway)
  sidestepped the need to inspect the old one at all. Worth
  remembering as a general pattern: prefer regenerating over
  inspecting when a file holds live secret material, even for a
  "just checking the format" purpose.
- **Terminal paste overlap produced misleading local errors unrelated
  to the repo.** Two separate command blocks (a gas-price Python
  check, and the funding relay) landed in the same paste/execution
  window, and zsh tried to execute the first block's Python heredoc
  lines as bare commands after the second block's real work had
  already completed successfully (`zsh: command not found: gas_price`
  etc.). Cosmetic and local only -- no repo or `.env.local` state was
  affected -- but worth recognizing this error shape immediately as a
  paste-history artifact rather than a real failure, so it doesn't
  cost a diagnostic round-trip next time it happens.

## Session Notes (cont. 11)

- **An opaque error response usually is not opaque -- something is
  carrying the reason and nothing is reading it.** The empty-body 402
  had been treated across two sessions as a failure with "no
  server-side log at all." The reason was in the `payment-response`
  response header the whole time, base64-encoded, one `atob` away.
  Several hypotheses were burned reasoning about what MIGHT have
  failed before anyone read what the server actually SAID. Standing
  habit for this project: when a response is unhelpfully empty, dump
  every header with its value before theorizing. Guessing the header
  name (`PAYMENT-REQUIRED`) also cost a round-trip -- dump them all,
  do not guess one.

- **Four adapter patches were spent guessing at a boundary instead of
  instrumenting it.** The BigInt crash was fixed on the transaction
  path, then re-diagnosed on the typed-data path, then the gas field
  name was guessed twice. Each patch was anchor-verified and safe, but
  the sequence was avoidable: the facilitator sits on the other side of
  the boundary and logs nothing about what it decodes. Adding that log
  line first would have answered in one round-trip what four did not.
  This is the same lesson as "read the compiled source, do not trust
  the type signature," applied to runtime values rather than APIs:
  instrument the boundary before patching across it.

- **`&&` between a `grep` and follow-up commands makes "no matches"
  indistinguishable from "the rest never ran."** A discovery command
  chained with `&&` produced empty output that read as a broken
  command; `grep` had simply exited non-zero on zero matches and
  short-circuited the rest. Use `;` when later commands are not
  conditional on the grep succeeding. Same family as the
  paste-history artifact in cont. 10 -- a benign non-result that looks
  like a failure.

- **A read-only ledger query burned five attempts and was abandoned.**
  Checking which DID received the BSC deposits failed on: `tsx -e`
  having no directory to resolve relative imports against, `tsx` not
  reading `tsconfig` path aliases, `dotenv-cli` not being installed,
  `export $(...)` dumping the entire environment, and finally a guess
  at the generated Prisma client's location that was never verified
  (`src/generated/prisma` is gitignored and may not exist until
  `postinstall` runs). It was eventually answered, and BOTH real causes
  turned out to be mundane and unrelated to any of the above: (1) the
  Prisma 7 `prisma-client` generator emits TypeScript source with NO
  `index.ts`, so the import must be
  `src/generated/prisma/client`, not the bare directory -- the
  directory existed the whole time; (2) `DATABASE_URL` lives in `.env`,
  not `.env.local`, so every attempt that grepped `.env.local` passed
  an empty string and `pg` silently fell back to a local default named
  after the macOS user. See the resolved DID entry in Open Questions.

- **Privy renders a full EIP-712 payload in its signing modal**, which
  made it possible to verify the Permit2 domain, spender, and witness
  visually before signing. Useful diagnostic surface worth reaching for
  again -- it confirmed the payload was correct while the failure was
  downstream.
- **Reach for the tool that touches the thing directly.** Seven
  attempts to read the ledger went through the application's own
  Prisma client -- adapter config, driver adapters, env loading, path
  aliases, generated-client resolution, all of it incidental to the
  actual question. `psql hoodstack_dev -c 'SELECT * FROM
  "LedgerEntry" ORDER BY "createdAt" DESC LIMIT 10;'` answered it
  immediately and would have at any point. For read-only inspection of
  local Postgres, use `psql`; reserve the Prisma client for code that
  actually needs the app's types. Same shape as this session's other
  lesson about instrumenting a boundary rather than patching across
  it: prefer the shortest path to the real value.
- **`LedgerEntry`'s real column names are `userId` and
  `amountMicroUsd`** -- not `did` and `amount`, both of which were
  guessed and both of which failed. Full schema: `id`, `userId`,
  `type` (`LedgerEntryType` enum), `amountMicroUsd` (bigint), `asset`,
  `chainId`, `txHash`, `createdAt`. Worth reading with
  `psql hoodstack_dev -c '\d "LedgerEntry"'` before writing any query
  rather than inferring names from the domain language used in these
  notes.

## Session Notes (cont. 12)

- **The instrumentation earned its keep in a single round-trip.** The
  prior session spent four anchor-verified adapter patches guessing at
  the Privy boundary and got byte-identical errors each time. This
  session added one log line on the far side of that boundary and the
  bad value was readable immediately -- its ASCII decode
  (`0x30783131313730` -> `"0x11170"`) named the bug outright. Third
  occurrence of this underlying pattern, so per closing ritual #5 it is
  now a standing rule in `ai-workflow-rules.md` rather than another
  note here.
- **A byte-identical result across two different inputs is evidence
  about the EXPERIMENT, not only about the system.** Sending both `gas`
  and `gasLimit` produced no change at all, which was read as proof the
  bad value originated inside Privy. It was not: both fields were
  corrupted identically by the same encoding step, so the test could
  never have distinguished them. When a change makes literally no
  difference, first ask whether it was distinguishable at the boundary
  being tested.
- **Re-running an unchanged system produces no new information.** The
  same failing deposit was run three separate times mid-session before
  any fix existed, each producing an identical `payment-response`.
  Nothing was learned beyond what the first run showed. The useful
  action at that point was always on the other side of the boundary.
- **A stale process silently invalidated a test.** `npm run dev` in
  `facilitator/` died on `EADDRINUSE` while an older instance kept
  serving port 4022, so a run that appeared to exercise the new logging
  was actually served by a build predating it. Kill the port
  (`lsof -ti:4022 | xargs kill`) and confirm the startup banner before
  trusting any facilitator-side observation.
- **Pipe the facilitator to a file rather than relying on scrollback.**
  `npm run dev 2>&1 | tee /tmp/facilitator.log` made `grep -A 25`
  possible and survived terminal churn; the multi-line decoded-tx dump
  is impractical to read any other way.
- **The connected Rabby wallet was briefly the test treasury address**
  (`0x1386405...`), meaning deposits were paying to an address whose
  key sat in the browser. Harmless for a throwaway testnet value, but
  not a habit to carry into anything with a real treasury.

## Session Notes (cont. 13)

- **`dist/dts/` answers most SDK questions and `dist/esm/` answers
  few.** Both `showWalletUIs` questions this session -- does a
  per-call override exist, and is it on the methods this code already
  calls -- were answered by plain `grep -n` on the unminified
  TypeScript declarations. The minified bundle was only needed to
  confirm Privy relies on the same per-call false internally. Read
  `dist/dts/` first; drop to `dist/esm/` only when the types are
  genuinely ambiguous. This does NOT weaken the standing rule about
  reading compiled source over type signatures -- that rule is about
  whether a hook is WIRED to anything, which dts cannot answer. It is
  about which file to open first for a question about an API's shape.
- **Two grep habits that do not work on `node_modules`.** BSD
  `grep -E` on macOS rejects interval expressions with a zero lower
  bound (`{0,120}`) -- "invalid repetition count(s)". And `grep -n` on
  a minified bundle prints the ENTIRE FILE as one line, which floods
  the terminal and answers nothing. For windowed extraction from
  minified source, use a Python one-liner with `re.finditer` and
  explicit slicing.
- **Heredocs do not survive paste into this terminal.** A
  `python3 - <<'EOF'` block lost its opener; zsh swallowed the body as
  continuation lines and `EOF` silently closed it, producing no output
  and no error. This is the THIRD variant of the same underlying
  problem, after backslash line continuations and `<placeholder>`
  syntax (both cont. 9), so per closing ritual #5 it is promoted to a
  standing rule in `ai-workflow-rules.md` rather than logged again
  here.
- **An empty grep result was read as a contradiction when it was just
  premature.** `grep` on the facilitator log came back empty while the
  page reported a settled deposit; this was called "contradictory" and
  several failure modes (silent local rejection, stdout buffering,
  wrong `FACILITATOR_URL`) were listed before establishing the simplest
  explanation -- the grep ran before the deposit was submitted. The
  log had 154 lines moments later. Same family as cont. 10's
  paste-history artifact and cont. 11's `&&`-after-grep: a benign
  non-result that looks like a failure. Establish WHEN a diagnostic ran
  relative to the action it is measuring before theorizing about what
  it means.
- **A zero-modal result is not self-evidently a pass.** The deposit
  settled with no Privy prompts, which looks like proof the override
  works -- but the approval leg never ran, so half the thing being
  tested was never exercised. The tell was in the facilitator log
  (`sendTransactions` absent), not in the browser. Same shape as
  cont. 12's byte-identical-result lesson: when a result looks clean,
  check that the mechanism under test actually executed.

## Session Notes (cont. 14)

- **A stale `tsconfig.tsbuildinfo` made a correct fix look like a
  no-op.** Changing `target` to `ES2020` produced byte-identical
  errors on the next `tsc --noEmit`. `--showConfig` confirmed the
  config genuinely resolved to `es2020`, so the file was right and the
  OBSERVATION was stale: `incremental: true` had cached the previous
  run's diagnostics. `rm -f tsconfig.tsbuildinfo` and it passed
  immediately. This is a new shape of an old trap -- cont. 12's rule
  says a byte-identical result is evidence about the experiment, and
  here the experiment was fine while the measurement was cached.
  Standing habit: after any `tsconfig.json` change, delete
  `tsconfig.tsbuildinfo` before trusting a `tsc` result.

- **`vercel env add <name> preview` cannot be driven by stdin at all**
  -- stronger than the "not reliable" note from an earlier session,
  and now understood. It asks TWO questions (value, then Git branch)
  but reads the ENTIRE stdin as the value: piping the string alone
  leaves the branch prompt unanswered and the command exits without
  adding anything, while piping the string plus a newline fails with
  "Value contains newlines". Interactive paste into the masked prompt
  also failed repeatedly, and selecting the "Leave as is" recovery
  option silently added the variable with an EMPTY value while
  printing a green checkmark. Production has one prompt and works fine
  via stdin. For Preview, use the web dashboard -- there is no working
  CLI path.

- **A placeholder was pasted verbatim into a real write, again, and
  this time it reached production.** A command that wrote a
  placeholder to a temp file and uploaded it to Vercel in one chained
  line put the literal string `PUT_POOLED_STRING_INSIDE_THESE_QUOTES`
  into production's `DATABASE_URL`. The byte-count check that would
  have caught it (`wc -c` showing 37 instead of ~200) was in the same
  chain, printing after the damage. The lesson is not "label
  placeholders better" -- that has been logged twice already (cont. 7,
  cont. 9) and did not work. It is that a value-writing step and the
  step that CONSUMES that value must be separate commands, so the
  verification between them can actually gate the second one.

- **Credential handling burned most of an hour and produced no
  rotation.** A connection string printed to the terminal was pasted
  into chat; the CLI command suggested to rotate it
  (`neon roles reset-password`) does not exist -- `neon roles` offers
  only list/create/delete. Suggesting an unverified subcommand is the
  same failure the project's standing rule already covers for SDK
  methods (a plausible-sounding name is not evidence it exists), and
  it applies to CLIs too. What worked in the end: redirect the string
  to a file, strip the trailing newline with `printf '%s'`, and feed
  the file to stdin, so the value never renders. General pattern for
  this project: paste RESULTS -- migration names, index names, row
  counts, error text -- never credentials; if output might contain
  one, redirect and send a byte count instead.

- **zsh glob expansion killed two diagnostic commands and both looked
  like findings.** `grep --include=*.ts` failed with "no matches
  found" because zsh expanded the flag's value before grep saw it, and
  `ls -la *.tsbuildinfo .next/*.tsbuildinfo` aborted the WHOLE command
  when one of the two globs matched nothing -- so the buildinfo check
  never ran and its absence was briefly read as evidence. Quote any
  glob passed as a flag value. This is the fourth distinct variant of
  the same underlying problem (after line continuations, heredocs, and
  `<placeholder>` syntax), so per closing ritual #5 it is promoted to
  the standing rule in `ai-workflow-rules.md` rather than logged again
  here.


## Session Notes (cont. 15)

- **A sandbox test caught a bug that `tsc` could not see, in code that
  had already been handed over.** The first version of the lazy-Prisma
  Proxy used `Reflect.get(client, prop, receiver)` -- passing the Proxy
  as the receiver. That type-checks perfectly and throws at runtime:
  `Cannot read private member #x from an object whose class did not
  declare it`, because `this` inside the method becomes the Proxy.
  It breaks `$queryRaw`/`$executeRaw` specifically -- the exact calls
  `reserveRound` and the ledger's advisory lock depend on. Found only
  because the script was run against a mock class with a private field
  BEFORE reaching the repo. The fix is to read off the client and BIND
  functions to it. General shape worth keeping: a Proxy is transparent
  to the type system and not to the runtime.

- **`vercel env pull` writes placeholders for Sensitive variables, and
  the placeholder length looks like a finding.** `PRIVY_VERIFICATION_KEY`
  came back as 36 characters, which was read as evidence the PEM had
  been flattened. It was not: `DATABASE_URL` (a known-good ~200-char
  string) came back as 26, and every sensitive variable was similarly
  short. The check that settled it was listing LENGTHS FOR ALL KEYS and
  noticing they were uniformly short. Nearly an hour of the wrong fix
  was avoided by that one comparison. General rule: before concluding a
  value is corrupt, confirm you are able to read it at all.

- **`vercel env add <name> preview` has THREE prompts, not two, and
  "Leave as is" silently stores an empty value.** Sensitive? comes
  FIRST, then Value, then Git branch. Piped stdin answers at most one.
  Tonight the paste into the masked Value prompt did not register, the
  recovery option "Leave as is" was selected, and the CLI printed a
  green checkmark for a variable with NO VALUE -- the exact failure
  cont. 14 already documented, reproduced. It was removed immediately
  (`vercel env rm DATABASE_URL preview`) because a present-but-empty
  variable is harder to diagnose than a missing one. Four attempts
  total across CLI and dashboard, all failed, on something that
  blocked nothing.

- **A command that opens a pager silently eats whatever is pasted
  next.** `git diff` and `git log` both open `less`; three separate
  commands this session went into the pager instead of the shell, one
  of which (`git commit` + `git push`) appeared not to have run and
  had actually succeeded off-screen. Promoted to a standing rule in
  `ai-workflow-rules.md` -- it is the fifth distinct variant of
  "the paste never reached the shell."

- **Neon's `LedgerEntry` is empty, and that is not a bug.** The
  `DROP NOT NULL` migration was checked against production data before
  applying; there is none. Every settled deposit in this project's
  history lives only in `hoodstack_dev`, because every deposit was
  driven through the local dev server. Worth stating plainly because
  "the deposit rail is proven end to end" is true of the MECHANISM and
  has never been true of the production database.

- **Three identical failing preview builds produced no new
  information.** The `DATABASE_URL` build failure was re-run three
  times across an hour while nothing about the environment had
  changed. Same lesson as cont. 12, recognised late again: re-running
  an unchanged system tells you nothing. The useful move was reading
  WHY the import failed at all, which produced the lazy-init fix and
  removed the requirement entirely.

- **A scrollback paste can look like fresh command output.** Twice
  tonight a re-pasted earlier block was read as the result of a
  command that had not actually run -- once for the writer script,
  once for a `grep` whose `&&` chain had short-circuited. Checking
  WHEN output was produced relative to the action it supposedly
  measures is the same habit cont. 13 already names.

## Session Notes (cont. 16)

- **The closing ritual was run (`c865932`), and then four more real
  commits landed (`92ad8d7`, `4902ffc`, `95dd403`, `4c5962a`) without a
  second pass.** `progress-tracker.md`'s "most recent state" kept
  saying production was broken and nothing linked to Coinflip for a
  week of wall-clock time after both were actually fixed, purely
  because the ritual only ran once, before that follow-up work
  happened. Caught this session by treating the tracker as a claim to
  verify against git log and live logs, not as ground truth by default
  -- the same posture `ai-workflow-rules.md` already asks for toward
  third-party SDK behavior, just not yet written down for the tracker
  itself. First occurrence of this specific shape (ritual completed,
  then more commits without a follow-up ritual pass), so logged here
  rather than promoted to a standing rule -- if it recurs a second
  time, the fix is probably "run the closing ritual per commit that
  touches `Current Phase`/`Current Goal`-relevant code, not per
  session."

## Session Notes (cont. 17)

- **CodeRabbit does not auto-review this repo, and assuming it had was
  wrong.** The ai-workflow-rules.md git-path rule says "Branch -> PR ->
  CodeRabbit, without exception" for money-adjacent paths, and a green
  `CodeRabbit: SUCCESS` status check on PR #19/#20 looked like that had
  happened. Reading the actual PR comment (not just the status check)
  showed CodeRabbit had posted "This repository does not receive
  automatic reviews because it has fewer than 10 stars" and never
  actually reviewed anything -- the SUCCESS status was CodeRabbit
  acknowledging the webhook, not completing a review. Fixed by
  commenting `@coderabbitai review` manually on each PR, which DID
  trigger a real review (PR #19's found a genuine input-validation gap,
  see Completed). General lesson: a green status check name is not
  itself evidence of what ran -- read what the bot actually said.
- **CodeRabbit's free-tier per-developer review limit is real, outlasts
  its own stated cooldown, and applies across ALL of one developer's
  PRs in the repo, not per-PR.** First hit on PR #20 ("next review
  available in 59 minutes"); re-triggering after that window (and much
  longer -- hours later in wall-clock time) kept landing on the same
  limit rather than clearing. Confirmed this is a shared budget, not
  independently-tracked per PR: PR #21 got ONE real review through
  cleanly, but its SECOND trigger (after pushing the fix commit) also
  came back rate-limited ("48 minutes"), immediately after PR #20's
  retry consumed whatever slot had opened. Net effect this session: two
  real reviews total were obtainable (PR #19, PR #21's first pass),
  and every other trigger -- however long the wait between attempts --
  hit the same wall. Resolution this session: merge on the strength of
  a genuine review already obtained and fixed, rather than keep
  spending turns waiting on a confirmation-only re-review (see Current
  Phase); hold anything that's never gotten a real review at all (PR
  #20) rather than merge around the gap.
- **Polling a bot's PR comment for "is the review done yet" needs a
  structurally-anchored match, not a loose keyword.** Grepping for
  "walkthrough" to detect a finished review false-matched TWICE in this
  session -- CodeRabbit's summary comment always contains a
  `Review Change Stack` link whose URL includes
  `utm_source=github_walkthrough`, present even in the "still
  processing" placeholder. Fixed by requiring the literal heading
  `^## Walkthrough` (anchored at line start), which only appears in a
  genuinely finished review. Separately: CodeRabbit EDITS its one
  "summarize" comment in place across a review's lifecycle rather than
  posting a new comment each time -- polling `.comments[-1]` (the
  numerically last comment) is not the same as polling the summarize
  comment's current content, since a later, unrelated reply (like
  CodeRabbit's own "Review triggered" acknowledgment) can sort after it
  and mask what the summarize comment actually says.
