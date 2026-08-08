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
