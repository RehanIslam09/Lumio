# AGENTS.md

> [!warning] Always-loaded file. Keep it under 70 lines.
> Details live in linked docs. Read them as instructed below, not "just in case".

## Project
Web-based narrative design tool for game writers: branching **flow graph** + **lore/relationship graph** + automated **consistency checker** + real-time collaboration.
Stack: TypeScript, React + Vite, React Flow, Tiptap + Yjs (Hocuspocus), Node (Hono/Fastify), PostgreSQL, pnpm + Turborepo.
Source of truth for anything technical: `docs/ARCHITECTURE.md` (only sections marked `DECIDED` are binding).

## Session start protocol (MANDATORY, in this order)
1. Read this file fully.
2. Read `docs/context/last-stable-state.md` fully.
3. Read `docs/context/recent-work.md` fully.
4. Read `docs/RULES.md` fully.
5. Read `docs/ARCHITECTURE.md`: index first, then ONLY the sections relevant to the task.
6. Reply with at most 5 lines: the task as you understand it, files you expect to touch, anything UNVERIFIED or unclear.
   - If the task touches schema, DSL grammar, sync/CRDT, checker semantics, or export format: STOP and wait for "go".
   - Otherwise proceed.

Do NOT read `docs/context/work-archive.md` unless a log entry explicitly points to it.
Do NOT scan the whole repo. Locate code with grep / file search / the file map in `ARCHITECTURE.md`.

## Hard rules (full text and IDs in `docs/RULES.md`)
- Never invent file paths, function names, package APIs, config keys, URLs, or test results. Verify by reading or running. If you cannot verify, write `UNVERIFIED:` and ask.
- No new dependency without explicit approval.
- Shared types come only from `packages/schema`. `packages/checker` and `packages/dsl` stay pure (no DOM, DB, network, or framework imports).
- One task at a time. Small diffs. No unrelated refactors or drive-by formatting.
- "Done" requires the real output of `pnpm check` pasted in the log entry. No output means not done.
- Never edit an applied DB migration. Add a new one.
- Never run state-changing git commands (add, commit, push, tag, branch, switch, reset, ...). The user commits manually. Read-only git is fine.
- Never edit `last-stable-state.md` except through `/promote-stable`.
- Ambiguity or conflicting instructions: ask. Do not guess.

## Session end protocol (MANDATORY)
Run `/finish-task`: gate (`pnpm check`) -> append entry to `docs/context/recent-work.md` -> update the file map in `ARCHITECTURE.md` if files were added, moved, or deleted -> short report.
If you are running out of budget or blocked, still write the entry with `Status: PARTIAL` or `BLOCKED`.

## Token discipline
- Read line ranges, not whole large files. grep first, then targeted read.
- Never paste large file contents into chat. Reference `path:line`.
- Do not restate what the docs already say. Link to it.
- Final chat summary: at most 15 lines. The full record goes in `recent-work.md`.

## Where things live
| Need | File |
|---|---|
| Rules (with IDs like R1.2) | `docs/RULES.md` |
| Design, data model, file map | `docs/ARCHITECTURE.md` |
| What was done recently (rolling window) | `docs/context/recent-work.md` |
| Last known-good commit + how to run it | `docs/context/last-stable-state.md` |
| Old work, full detail | `docs/context/work-archive.md` (on demand only) |
| Workflows | `.agent/workflows/` (`/start-task`, `/finish-task`, `/promote-stable`) |

- Environment: native Windows + PowerShell only. Never use or suggest WSL, Docker, bash-only commands, or Linux-only tooling. The dev database is a native Windows PostgreSQL install.