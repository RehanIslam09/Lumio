# RULES

> [!info] How to use
> Rules have IDs. Cite them in logs and reviews (e.g. "violates R2.3"). If a rule blocks the task, stop and ask. Do not work around it.

## 1. Truthfulness (anti-hallucination)
- **R1.1** Before using any library API, confirm the package is in `package.json` and read its types in `node_modules` or the official docs. Do not rely on memory for React Flow, Yjs, Tiptap, Hocuspocus, Drizzle, or Vite. Their APIs change.
- **R1.2** Before referencing a file, function, type, or env var, confirm it exists (`ls`, `grep`, open it). Never write imports for modules you have not seen.
- **R1.3** Never claim tests, lint, or type-check passed unless you ran them in this session. Paste the last ~20 lines of real output.
- **R1.4** Label uncertainty in code comments and logs: `ASSUMPTION:` (you chose a default) or `UNVERIFIED:` (could not confirm). Never silently assume.
- **R1.5** If you cannot find something, say so. Do not create a plausible-looking substitute.
- **R1.6** No fabricated benchmarks, URLs, citations, version numbers, or sample data presented as real.
- **R1.7** `ARCHITECTURE.md` sections marked `DRAFT` or `TODO` are suggestions, not facts. Ask before building on them.

## 2. Scope and change control
- **R2.1** Do only what the task asks. List the files you will touch before editing.
- **R2.2** No unrelated refactors, renames, or formatting sweeps.
- **R2.3** Never delete or weaken a test to make it pass. Never disable lint or TypeScript rules. A `@ts-expect-error` needs a justification comment and a mention in the log.
- **R2.4** No new dependency without approval. When asking, give: name, why, size, maintenance status, alternatives.
- **R2.5** Ask first (stop and wait) before: DB schema change, new migration, DSL grammar change, sync/CRDT protocol change, checker rule semantics change, export JSON format change, deleting files.

## 3. Code standards
- **R3.1** TypeScript `strict`. No `any`; use `unknown` and narrow.
- **R3.2** Validate all external input with Zod at boundaries (HTTP, WebSocket, import, export).
- **R3.3** Types are defined once in `packages/schema` and imported everywhere. Never redefine them.
- **R3.4** Prefer small pure functions. Side effects live at the edges.
- **R3.5** Export JSON is versioned (`schemaVersion`). Breaking changes need a version bump and a migration note.

## 4. Package boundaries
| Package | May import | Must NOT import |
|---|---|---|
| `packages/schema` | zod | anything else in repo |
| `packages/dsl` | schema | DOM, DB, network, React |
| `packages/checker` | schema, dsl | DOM, DB, network, React |
| `packages/export` | schema | DOM, DB, network |
| `apps/server` | all packages | `apps/web` |
| `apps/web` | all packages | `apps/server` |

- **R4.1** Violating the table above is a defect, even if it compiles.

## 5. Testing and the gate
- **R5.1** The single gate is `pnpm check` (typecheck + lint + unit tests). It must pass before a task is "done".
- **R5.2** `dsl` and `checker` changes need unit tests AND at least one `fast-check` property test.
- **R5.3** Bug fixes start with a failing test that reproduces the bug.
- **R5.4** Changes to sync/collaboration need a two-client Playwright test.
- **R5.5** Never mark a flaky test as skipped without logging it under Known issues.

## 6. Git
- **R6.1** The agent NEVER runs git commands that change state: no `add`, `commit`, `push`, `tag`, `branch`, `checkout`/`switch`, `merge`, `rebase`, `reset`, `stash`. Read-only commands (`status`, `diff`, `log`, `show`, `rev-parse`) are allowed. The user handles all version control manually.
- **R6.2** At the end of a task, suggest a conventional commit message (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) in the final report so the user can commit.
- **R6.3** Never write secrets or credentials into any file. Keep `.env.example` current and make sure `.gitignore` covers `.env`.

## 7. Logging duty
- **R7.1** Every task ends with an entry in `docs/context/recent-work.md` (format in that file).
- **R7.2** Entries state facts: files changed, exports added (with signatures), decisions and why, commands run with results, known issues, next steps.
- **R7.3** If the file map in `ARCHITECTURE.md` changed, update it in the same task.
- **R7.4** Keep `recent-work.md` within its size cap (rotation steps in `/finish-task`).

## 8. Security
- **R8.1** Every server mutation checks authentication and authorization (role: viewer / writer / lead).
- **R8.2** No secrets in code or logs. Config via environment variables.
- **R8.3** Treat user-authored text (node bodies, DSL) as untrusted. Never `eval`; the DSL is parsed and interpreted, not executed.

## 9. When to stop and ask
Stop and ask instead of proceeding if: requirements conflict, a rule blocks the task, you need an R2.5 change, you have been stuck on the same failure three attempts in a row, or the task would touch more than ~10 files.