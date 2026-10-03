# /start-task

Begin a new feature or fix with full, cheap context.

Input: a one-paragraph task description from the user.

Steps:
1. Read `AGENTS.md`, `docs/context/last-stable-state.md`, `docs/context/recent-work.md`, `docs/RULES.md` (all fully).
2. Read the index of `docs/ARCHITECTURE.md`, then only the sections relevant to the task. Note their status (DECIDED / DRAFT / TODO).
3. Run read-only `git status`. Mention any unexpected uncommitted changes. Do not create branches or commit (R6.1).
4. Reply in at most 8 lines:
   - Task in your words
   - Files you expect to touch
   - Relevant rules (IDs) and any R2.5 "ask first" triggers
   - UNVERIFIED items or questions
5. If an R2.5 trigger applies or anything is unclear, wait for "go". Otherwise begin.