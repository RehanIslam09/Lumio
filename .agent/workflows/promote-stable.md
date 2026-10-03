# /promote-stable

Record the current commit as the last stable state. Run only when the user explicitly invokes it.

Steps:
1. Run read-only `git status`. The user must already have committed; if the working tree is dirty, stop and tell them.
2. Run `pnpm check`. If it does not fully pass, stop and report. Do not promote.
3. Ask the user to confirm: "Promote <short hash> as stable?" Wait for a yes.
4. Overwrite `docs/context/last-stable-state.md` fields: date, branch, full commit hash (via read-only `git rev-parse HEAD`), tag name, gate summary (real output), approver, what exists and works, how to run, environment, known broken.
5. Do NOT create a tag (R6.1). Print the command for the user to run, e.g. `git tag stable-### <hash>`, and record the tag name in the file.
6. Add a `recent-work.md` entry noting the promotion.