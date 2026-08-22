# AI Workflow Rules

## Approach

Build Chipstack incrementally using a spec-driven workflow. The
context files define what to build, how to build it, and the current
state of progress. Always implement against these specs — do not
infer or invent product or payment behavior from scratch, especially
anything touching money or identity.

## Scoping Rules

- Work on one feature unit at a time
- Prefer small, verifiable increments over large speculative changes
- Do not combine unrelated system boundaries in a single
  implementation step

## When to Split Work

Split an implementation step if it combines:

- Game UI/logic changes and ledger or payment changes — these have
  different risk profiles and need separate review
- Multiple unrelated API routes
- Behavior not clearly defined in the context files (e.g. exact KYC
  vendor, exact withdrawal limits)

If a change cannot be verified end to end quickly, the scope is too
broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files
- If a requirement is ambiguous, resolve it in the relevant context
  file before implementing
- If a requirement is missing, add it as an open question in
  `progress-tracker.md` before continuing

## Protected Files / Areas

Do not modify the following unless explicitly instructed:

- `services/ledger/*` and `services/rng/*` — treat any change here as
  requiring manual review before merge, even mid fast-iteration
- Generated UI library components (`components/ui/*`)
- Any third-party library internals

## Choosing a Git Path

Decide by rule, not per session. This has been re-litigated three times
on money-adjacent code and gone direct to `main` each time, which means
asking again is not producing a different answer -- it is just producing
the same answer more slowly.

**Branch -> PR -> CodeRabbit, without exception:**

- `services/ledger/*`, `services/rng/*`
- Anything that spends from the facilitator's gas wallet, moves user
  funds, or changes how a settlement is verified or credited
- Anything touching `HOUSE_TREASURY_ADDRESS` or treasury key handling

**Direct to `main` is correct for:**

- Docs and context files
- `/dev/*` harness code -- it has no player-facing surface and cannot
  move funds on a real user's behalf. This is the standing exemption
  that tonight's `page.tsx` commit relied on; it is written down here
  so it is a rule rather than a defensible exception each time.
- Genuine active-incident hotfixes (rare, and logged as one-offs)

When something sits between these -- dev-only code that nonetheless
changes a signing path used by real settlements, which is exactly what
tonight's change was -- take the branch. The cost is about ninety
seconds and the alternative is discovering the pattern only by counting
occurrences after the fact.

## A Background Monitor Is Not a Merge Gate

CodeRabbit review has now failed to gate a merge on money-adjacent code
across five straight PRs (#20-#25): rate-limited on #20/#23/#24, landed
late and unread on #22 (fixed in a fast-follow, PR #23), and on #25
didn't even get the chance to rate-limit -- the merge landed before the
review ran at all, and CodeRabbit's own retry then refused because the
PR was already closed. A `Monitor` poll waiting on a review result is
not a substitute for actually checking synchronously right before
calling something safe to merge -- the person can and does act in
parallel, and a still-running background watch can lag behind a real
merge by minutes.

Standing rule: for anything on the "branch -> PR -> CodeRabbit" list
above, do not advise "safe to merge" (or silently treat a merge as
gated) on the strength of a Monitor task that hasn't yet reported back.
Check synchronously (`gh pr view <n> --json reviews,comments`) at the
moment of the claim. If the person merges before a review lands
anyway, that is their call to make -- but log it plainly in
`progress-tracker.md` rather than assuming a background watch was
doing the job it wasn't built to do.

## Editing Existing Files

Before building any anchored replacement (or any find-and-replace) for
a file, read the anchor's real bytes from the file itself, in the same
session, immediately before writing the script:

```bash
sed -n '/START_PATTERN/,/END_PATTERN/p' path/to/file
cat -evt path/to/file          # note: BSD cat on macOS has no -A
```

Never reconstruct an anchor from a file dump pasted earlier in the
conversation. Chat transcription does not preserve leading whitespace
reliably, and an anchor that is correct in content but wrong by two
spaces of indentation fails the same way a wrong anchor does. This
promoted to a standing rule after three mismatched-anchor aborts in a
single session (see Session Notes (cont. 9)); the aborts were safe, but
each cost a round-trip.

Every replacement script must still verify `text.count(anchor) == 1`
and exit without writing on any mismatch.

## Verifying Third-Party Library Behavior

A type signature, a `.d.ts`, or a plausible-sounding method name is not
evidence that something is wired to anything. Before integrating
against any SDK behavior, read the installed compiled implementation:

```bash
# in a scratch dir, not the repo
npm pack <package>@<exact-version> && tar -xzf <package>-<version>.tgz
grep -n "functionName" package/dist/cjs/index.js
```

This project has repeatedly lost time to the opposite habit:
`ExactEvmScheme.enhancePaymentRequirements` looked like the extension
hook and is a no-op stub; `signTransaction` was assumed to belong to
`FacilitatorEvmSigner` and belongs to `ClientEvmSigner`;
`trySignErc20ApprovalExtension` silently returns `undefined` when
`readContract` is absent rather than erroring; and
`RouteConfig.extensions` needed an object where a boolean type-checked
fine. Each was found only by reading compiled source, and each was
invisible to `tsc`.

## Instrumenting a Boundary Before Patching Across It

When a value crosses into third-party code -- a wallet SDK's signing
path, a facilitator's decode, any serialization boundary -- and comes
back wrong, add logging on the FAR side before changing what gets sent.
Do not iterate on the arguments while the receiving end is silent about
what it actually received.

This is the runtime-values counterpart to the compiled-source rule
above, and it is a standing rule because guessing has now cost three
separate sessions:

- Four adapter patches against Privy's `signTransaction` produced
  byte-identical facilitator errors, because both candidate fields were
  corrupted the same way and the experiment could not tell them apart.
- One log line in the facilitator's `sendTransactions`, printing the
  decoded transaction, named the bug on first read: the gas value's
  ASCII decode was the hex string we had sent.
- Earlier, the same shape: an "opaque" empty-body 402 whose real reason
  sat in the `payment-response` header through two sessions of
  theorizing.

Corollary worth stating outright: if a change produces literally no
difference in the output, suspect the experiment before concluding
anything about the system. Byte-identical results usually mean the two
cases were never distinguishable at the boundary being tested.

## Handing Over Commands in Chat

A command handed over in chat has to survive a copy/paste into a real
zsh session. Five separate constructs have now failed that trip, each
costing a round-trip, so this is a standing rule rather than a habit:

- **Single unbroken lines.** No backslash line continuations -- they
  are dropped on paste, so zsh runs the first fragment alone and then
  tries to execute the remaining flags as standalone commands. Prefer
  one long line however unwieldy it looks.
- **No heredocs.** A `python3 - <<'EOF'` block lost its opener on
  paste; zsh treated the body as continuation lines and `EOF` closed
  it, producing no output and no error -- the most expensive failure
  shape, because it looks like the command ran and found nothing. Use
  `python3 -c '...'` for inline scripts, or hand over a real file.
- **Placeholders must be syntactically unrunnable, not just labeled.**
  `BURNER=<paste the address>` was pasted verbatim and zsh read `<` as
  a redirect. Use `0xYOUR_ADDRESS_HERE`. The same applies to
  edit-first commands generally: if a command must be edited before
  running, it needs to LOOK different from a runnable one, not just be
  described as such in prose.
- **Quote any glob passed as a flag value, and never chain two globs.**
  `grep -rn "x" src/ --include=*.ts` dies with "no matches found"
  because zsh expands the flag's VALUE before grep ever runs -- write
  `--include="*.ts"`. Worse, a command listing two globs
  (`ls -la *.a .next/*.b`) aborts ENTIRELY when either matches
  nothing, so the check never executes and its silence reads as a
  finding. Both happened tonight, and the second one briefly counted
  as evidence in a diagnosis.
- **A step that WRITES a value and the step that CONSUMES it must be
  separate commands.** The bullet above says to make placeholders
  unrunnable; that rule has now failed three times, most recently by
  putting the literal string `PUT_POOLED_STRING_INSIDE_THESE_QUOTES`
  into production's `DATABASE_URL` on Vercel. The byte-count check
  that would have caught it sat in the same `;`-chained line and
  printed AFTER the upload had already happened. Labeling is not the
  control. The control is a gap: write the value, verify it (`wc -c`,
  `grep -c`), and only then run the command that consumes it, as a
  separate paste. A chain removes the operator's chance to stop.

- **Never hand over a paste immediately after a command that opens a
  pager.** `git diff`, `git log`, and `psql` without `| cat` all page
  through `less`, and `less` swallows whatever is pasted next -- the
  shell never sees it. Three commands vanished this way in a single
  session; worse, one of them (`git commit` followed by `git push`)
  had actually succeeded off-screen, so the next check was read as
  "the work never happened" when it had landed. Suffix `| cat` on
  anything that might page, and treat a command that produces no
  visible effect after a pager as unrun rather than failed.

Corollary for the far side: when a pasted command produces an odd local
error, check whether it is a paste artifact before treating it as a
real failure. Leftover fragments from an earlier block executing after
a later one, a `grep` short-circuiting an `&&` chain on zero matches,
and a diagnostic that simply ran before the action it was measuring
have all been misread as system failures on this project.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. `npm run build` passes
