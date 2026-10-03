# /promote-stable

Record the current commit as the last stable state. Run only when the user explicitly invokes it.

Steps:
1. Confirm the working tree is clean (`git status`) and you are on the commit to promote.
2. Run `pnpm check`. If it does not fully pass, stop and report. Do not promote.
3. Ask the user to confirm: "Promote <short hash> as stable?" Wait for a yes.
4. Overwrite `docs/context/last-stable-state.md` fields: date, branch, full commit hash, tag, gate summary (real output), approver, what exists and works, how to run, environment, known broken.
5. Create the git tag (e.g. `stable-###`). Do not push unless asked.
6. Add a `recent-work.md` entry noting the promotion.

