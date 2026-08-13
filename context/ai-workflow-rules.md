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
