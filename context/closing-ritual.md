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
Covered this session: <2-5 sentences of real narrative — what was
built, what was verified and how, any dead ends or wrong guesses that
were caught and corrected, any real decisions made and why>

Do next:
1. <highest-priority next action>
2. ...

Do NOT: <short list of guardrails specific to what could go wrong if
someone — Claude or the person — picks this back up carelessly>

#MAC — start next session:
```bash
<exact commands to get both dev servers / whatever's needed running>
```
```

Optional addition if it's useful for that particular session: a
progress-bar/flow-status visual summarizing overall project state.
This has been used in some past sessions and skipped in others — it's
a nice-to-have for orienting quickly, not a required part of the
ritual. Don't let building it substitute for the real `Do next`/`Do
NOT` content above.

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
- [ ] 3. Next-session brief written (Covered / Do next / Do NOT / #MAC)
- [ ] 4. Updated `context/*.md` files dragged into the Project file panel
- [ ] 5. Any 3rd-occurrence mistake promoted to a standing rule; anything less logged in Session Notes only
