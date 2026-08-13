# Closing Ritual

Run this at the end of every Hoodstack session that changed code, docs,
or a real decision. Read this file fresh each time rather than
reconstructing the ritual from memory or a past session's summary —
that reconstruction has itself been a source of wasted time (see
Session Notes in `progress-tracker.md`, multiple sessions).

There are five rituals, in this order. Don't skip one because it seems
minor — #4 and #5 are the two that have been missed most often in
practice, precisely because they don't produce terminal output that
feels like "real" progress.

---

## 1. Update `progress-tracker.md`

**Never write this from memory, a cross-session digest, or the Claude
Project file panel's copy.** All three have caused a wrong or stale
anchor in past sessions — the file panel copy in particular is a
manually-synced snapshot, not a live view of the repo (see ritual 4).

Steps:

1. Pull the real current file fresh, this session, before drafting any
   edit:
   ```bash
   cd ~/Documents/hoodstack && cat -n context/progress-tracker.md
   ```
   For a long file, a targeted `sed -n 'START,ENDp'` on just the
   section(s) you expect to touch is fine — but if you're touching
   `Current Phase`/`Current Goal`, get those explicitly; don't assume
   they're unchanged just because you didn't plan to touch them.

2. Decide what actually needs to change. Typically some subset of:
   - **Completed** — append a new entry for what shipped. Include real
     specifics (commit hashes, tx hashes, exact error messages fixed,
     what was verified and how) — vague entries are worthless to a
     future session deciding whether something is actually done.
   - **Current Phase / Current Goal** — only refresh if tonight's work
     materially changed the honest answer to "what's the state" or
     "what's next." Don't touch these reflexively.
   - **Next Up** — rewrite or remove items that are now done; add new
     ones surfaced tonight. Prefer rewriting an item in place over
     deleting it if it's partially done — say what's left, not just
     that it moved.
   - **Open Questions** — resolve ones tonight actually answered; add
     new ones surfaced tonight.
   - **Session Notes** — append a new `## Session Notes (cont. N)`
     section (check the highest existing N first) for real mistakes,
     real dead ends, and real lessons from tonight. This is where
     ritual 5's findings usually land (see below) unless they clear
     the bar for a standing rule instead.

3. Write an anchor-verified Python script, one replacement per logical
   edit, that:
   - Reads the file once.
   - For each anchor, checks `text.count(anchor) == 1` and aborts
     (`sys.exit(1)`, no write) if it isn't exactly 1 — print the repr
     of the anchor that failed so the mismatch is diagnosable, not
     just "something's wrong."
   - Only writes the file after *every* anchor has been confirmed.
   - Chain any following git commands with `&&` so a script failure
     blocks the commit rather than landing a partial state.

4. **Verify the script against the real pasted content before handing
   it over** — build a scratch reconstruction from what was actually
   pasted this session, run the real script against it, confirm the
   anchor counts and resulting section structure (`grep -n "^## "`),
   *then* hand it over. This has caught real mismatches before they
   reached the actual repo.

5. Hand over the script as a downloadable file with the exact `mv` +
   `python3` + cleanup command, matching whatever facilitates for the
   actual local file structure at play in that session.

---

## 2. Commit and push

Default: docs-only changes (like the `progress-tracker.md` update
itself) go straight to `main`.

For code changes, don't default silently — ask which path applies:

- **Branch → PR → CodeRabbit**, required without exception for
  `services/ledger/*` and `services/rng/*` (per `ai-workflow-rules.md`),
  and *recommended* for anything else that's money- or
  custody-adjacent even if it doesn't technically live in one of those
  two paths — e.g. code that spends from the facilitator's gas wallet.
  When it's ambiguous whether something clears that bar, ask; don't
  assume either default.
- **Direct to `main`** — fine for docs, and for genuine active-incident
  hotfixes (rare — this has happened once, for a production 404, and
  was explicitly logged as a deliberate one-off, not a pattern).

After merging a PR, sync local `main` and delete the merged branch:

```bash
git checkout main && git pull && git branch -d <branch-name>
```

---

## 3. Write the next-session brief

Format, every time:

```
End goal & progress
Goal: <one-line restatement of project-overview.md's core goal>

<one row per real workstream -- a directory or feature area from
architecture.md's System Boundaries, or a phase from Current Phase --
not an invented category>
<workstream name>          <ASCII bar, 20 chars>  <NN%>  <status>
...
────────────────────────────────────────────────────────────
Overall                     <ASCII bar>  ~<NN%>
```

Flow status: `<the real steps from project-overview.md's Core User
Flow, each marked done/pending -- e.g. Sign up ✅ → Verify ⬜ →
Connect/fund wallet ✅ → ...>`

<1-3 sentences: what moved tonight relative to last session, and what
is still the largest unstarted chunk of the whole product -- named
honestly, not softened>
```

**Building the progress table honestly, not decoratively:**

- Every percentage must trace back to a real, verifiable claim already
  in `progress-tracker.md`'s Completed section (a tx hash, a commit, a
  confirmed log line) -- never estimate from a general sense of "this
  feels mostly done."
- A percentage under 100% must be paired with what's concretely still
  missing (`✅ module built, ⬜ not wired to a caller`), not just a
  number.
- `Overall` is an eyeballed blend across workstreams, not a computed
  average of the bars above it -- don't imply false precision.
- The ASCII table is deliberately plain text: it survives copy/paste
  into a plain-text next-session brief and stays readable in a
  `git diff` if this ever gets pasted into a commit body. An
  interactive Visualizer widget, if built for a given session,
  supplements this table -- it never replaces it, since the widget
  itself doesn't persist into the next session's context the way this
  file's text does.

```
Do next:
1. <highest-priority next action>
2. ...

Do NOT: <short list of guardrails specific to what could go wrong if
someone -- Claude or the person -- picks this back up carelessly>

#MAC -- start next session:
```bash
<exact commands to get both dev servers / whatever's needed running>
```
```

## Special instructions

Only for things that need the person's own action beyond reading the
tracker -- not a restatement of a Next Up item. The test: would this
be silently lost or missed if the person only skimmed the numbered
`Do next` list? Typical cases:

- An artifact or file that exists only as this session's own output
  (a generated mockup, a downloaded asset) and was never committed --
  say so explicitly and say where to get it before the session ages
  out of easy reach.
- A file that's now stale somewhere the person might trust it (like
  this Project's file panel) -- point at exactly which file and where
  to drag it from, same as ritual 4 already does for
  `progress-tracker.md`.

If nothing this session needs the person's own action beyond the
normal next-session pickup, write "None this session" rather than
omitting the section -- an omitted section reads as "not checked," not
as "checked, nothing found."

## Unmentioned but worth flagging

Things that don't fit anywhere else in this brief but shouldn't be
allowed to quietly age out of visibility:

- Genuinely new findings from tonight that don't belong in `Do next`
  because they're not actionable yet -- an untracked file nobody's
  decided on, a stray directory, a discrepancy noticed but not
  investigated.
- A compact one-line reminder of standing blockers that haven't moved
  in a while (licensing/jurisdiction/trademark clearance, Vercel plan
  tier before launch, etc.) -- not the full explanation each time,
  just enough that they don't silently drop off the radar because
  they're always "someone else's problem, later."

If nothing new surfaced, write "Nothing new" rather than omitting the
section, for the same reason as above.

---

## 4. Sync the Project's file panel

**This is a manual browser action — it cannot be a terminal command,
and it is the ritual most often forgotten**, because it produces no
terminal output and the session naturally feels "done" after ritual 3.

Drag the freshly-updated `context/progress-tracker.md` (and any other
`context/*.md` file touched this session) from Finder into this
Claude Project's file panel, replacing the stale copy.

Why this matters: the file panel is a separate, manually-synced copy —
it does **not** auto-update from GitHub. If this is skipped, the next
session's `<documents>` context is the pre-session snapshot, not
tonight's real state, and the whole session risks being reconstructed
from stale content — the exact failure mode ritual 1 already works
hard to avoid on the git side.

---

## 5. Fix the actual recurring cause

Not the same as logging a mistake in Session Notes (that's part of
ritual 1). This ritual is about **deciding whether tonight's mistake
is a one-off or a pattern**, and acting differently depending on which:

- **First or second occurrence of a given mistake type** → a specific,
  concrete Session Notes entry is enough. Describe what happened and
  the general lesson, so a future session recognizes the shape of the
  mistake even if the specifics differ.
- **Third occurrence of the same underlying mistake type** → promote
  it from a Session Notes bullet into an actual standing rule in
  `ai-workflow-rules.md` or `code-standards.md` (whichever governs
  that behavior). At that point, logging it again in Session Notes
  has proven not to work — the fix has to change what a session does
  by default, not just what it's reminded of after the fact.

Before editing either governing file for a promotion, pull its real
current content fresh — same discipline as ritual 1, for the same
reason.

---

## Quick checklist

- [ ] 1. `progress-tracker.md` updated, anchor-verified against real content, committed
- [ ] 2. Code changes committed via the right path (branch+PR or direct), pushed
- [ ] 3. Next-session brief written (End goal & progress / Do next / Do NOT / Special instructions / Unmentioned but worth flagging / #MAC)
- [ ] 4. Updated `context/*.md` files dragged into the Project file panel
- [ ] 5. Any 3rd-occurrence mistake promoted to a standing rule; anything less logged in Session Notes only
