# /finish-task

Close out a task and preserve context for the next chat.

Steps:
1. Run `pnpm check`. Capture the real output. If it fails, fix it or record the failure honestly; do not claim DONE.
2. Review your diff: `git diff --stat`. Confirm no unrelated changes (R2.1, R2.2) and no new dependencies without approval (R2.4). Use read-only `git diff --stat` / `git status`.
3. Append a new entry at the TOP of the "Entries" section of `docs/context/recent-work.md` using the template there. Use the next ID (W-###). Include real command output in Verification.
4. Rotation: if there are more than 8 full entries, move the oldest full entry verbatim to the top of `docs/context/work-archive.md`, and add one line for it under "Older work" in `recent-work.md` (`W-### | date | title | outcome`).
5. If files were added, moved, or deleted, update the Repo map in `docs/ARCHITECTURE.md`. If a design decision was finalized, change that section's status to `DECIDED`.
6. Do NOT run any git write command (R6.1). In your final report, suggest a conventional commit message for the user to use.
7. Final chat message (max 15 lines): status, files changed count, gate result, open issues, next steps. Do not repeat the full log.