---
name: claude-rtl-phase
description: Start or resume a build phase (P0 through P6) of the claude-rtl project. Reads ROADMAP.md for that phase, loads its Context Required files, creates the git branch, implements end-to-end, runs node --test, and marks it done. Use when asked to start, resume, or work on a claude-rtl phase, such as /claude-rtl-phase P0, start P0, or work on P1.
---

# claude-rtl phase runner

When invoked with a phase id (e.g. P0):

1. **Load scope.** Open `ROADMAP.md`, find the phase block. Read EXACTLY the files in its "Context Required" line (the listed `ARCHITECTURE.md` sections and any existing source files) — do NOT read unrelated parts of the codebase. Also read the root `CLAUDE.md` and any `.claude/rules/` that match files you will edit.

2. **Branch.** Confirm a clean working tree. `git checkout -b <branch>` from the phase's `Branch:` line if it does not exist, else `git checkout <branch>`.

3. **Plan, then confirm.** Present a short plan: the files you will create/edit and the approach, mapped to the phase's "Build" items. WAIT for Lior's approval before writing any code (plan mode).

4. **Implement.** Build the phase's "Build" items. Obey the hard rules in `CLAUDE.md` and the matching `.claude/rules/`. For P0, write the corpus tests FIRST (failing), then implement to green. Make small, logical commits. Provide diffs for review.

5. **Verify against "Done when".** Run `node --test` for engine/DOM phases. Re-read the phase's "Done when" checklist and confirm each item. For browser/desktop phases that need a human check, list exactly what Lior should verify manually.

6. **Mark done.** ONLY after the "Done when" checklist passes, flip the phase status in `ROADMAP.md` from DOING/TODO to DONE, commit, and summarize what changed and what the next phase is.

Rules: never start a different phase than the one requested; never skip the plan-and-confirm step; keep `engine/` DOM-free; speak Hebrew to Lior (masculine forms).