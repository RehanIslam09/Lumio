# RECENT WORK

> [!important] Rolling log. Newest entry first. Read fully at session start.
> **Cap:** at most **8 full entries**. When adding a 9th, `/finish-task` moves the oldest full entry to `work-archive.md` and leaves a one-line summary under "Older work".
> **Write facts, not narration.** No entry without real command output.

## Entry template (copy for each task)
```markdown
### W-### | YYYY-MM-DD | <short title>
- **Status:** DONE | PARTIAL | BLOCKED
- **Git:** uncommitted (user commits manually). Suggested message: `<type: summary>`
- **Goal:** <one sentence>
- **Files changed:**
  - `path/to/file.ts`: <what changed, one line>
- **New/changed public APIs:** <exported names with signatures, or "none">
- **Decisions and why:** <bullets; cite rule IDs / ARCHITECTURE sections>
- **Assumptions / UNVERIFIED:** <bullets, or "none">
- **Verification:** `<command>` -> <pass/fail + key lines of real output>
- **Known issues / debt:** <bullets, or "none">
- **Next steps:** <bullets>
```

---

## Entries

### W-000 | 2026-10-01 | Agent operating docs created
- **Status:** DONE
- **Git:** n/a (docs only)
- **Goal:** Establish AGENTS.md, RULES.md, ARCHITECTURE.md, context files, and workflows.
- **Files changed:**
  - `AGENTS.md`, `docs/RULES.md`, `docs/ARCHITECTURE.md`: created
  - `docs/context/*`: created
  - `.agent/workflows/*`: created
- **New/changed public APIs:** none
- **Decisions and why:** Rolling log with archive to keep always-read context small.
- **Assumptions / UNVERIFIED:** `pnpm check` script does not exist yet; must be created in the first coding task.
- **Verification:** n/a
- **Known issues / debt:** ARCHITECTURE sections are mostly DRAFT.
- **Next steps:** Bootstrap monorepo; create `pnpm check`; fill `last-stable-state.md` after first green gate.

## Older work (one line each; full detail in work-archive.md)
- none yet