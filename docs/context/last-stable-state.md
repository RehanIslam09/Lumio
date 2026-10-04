# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | 2026-10-04 |
| Branch | `main` |
| Commit | `7d909786de148d7253e91b356c534d54bd37c94a` |
| Tag | `stable-005` |
| Gate result | `pnpm check -- --force` passed (11/11 tasks successful: typecheck, lint, test with 258 Vitest/fast-check tests across 4 packages) |
| Approved by | Rehan Islam |

## What exists and works
- Monorepo with pnpm workspaces and Turborepo 2 (`tasks` config).
- Shared TypeScript strict base config (`tsconfig.base.json`) and root ESLint 10 flat configuration (`eslint.config.mjs`).
- `@repo/schema` package with Zod schemas and inferred types for `FlowNode` (with `position` refinement), `FlowEdge` (with optional `condition` and `effects`), `Variable` (with `initial` value refinement), `Project`, `IssueRuleId`, `IssueSeverity`, `IssueLocation`, and `Issue` (XOR `nodeId`/`variableId` refinement).
- `@repo/dsl` pure package implementing hand-written lexer, recursive descent parser, AST traversal helpers (`collectReads`, `collectEffectUsage`), and static typechecker for conditions and effects with AST error spans, 200-depth nesting limit, cascade suppression, and silent top-level unknown handling.
- `@repo/checker` pure package implementing static analysis for unreachable nodes (`findUnreachableNodes`), nodes unable to reach end (`findNodesThatCannotReachEnd`), expression validation, typechecking, and variable usage rules (`unused-variable`, `variable-never-written`, `variable-never-read`).
- `@repo/web` frontend application (`apps/web`):
  - Pure TypeScript editor state module (`apps/web/src/editor`) with linear undo/redo history (capped at 100), referential integrity cascade deletion, validation against `@repo/schema`, no-op detection via structural equality, and 11 distinct action handlers.
  - Pure utility modules (`flowModel`, `defaults`, `draftCheck`, `keymap`, `layout`, `decorate`, `snippet`, `connections`, `persistence`) with 118 unit and property tests.
  - Interactive story canvas built on `@xyflow/react` 12: node dragging with transient drag coordinates and single-step commit on move, enlarged 14px handles with relaxed 30px connection radius, duplicate/self-loop rejection, non-blocking dismissible tip overlay, click-to-focus and pan animations.
  - 3-tab sidebar: Issues tab (grouped errors/warnings/variables with code snippets and click-to-focus), Inspector tab (contextual node title/type/content/position and edge condition/effects with live syntax & type validation, incoming/outgoing connections with edge focus and Connect-to dropdown, edge navigation buttons to jump to source or target), and Variables tab (name, type, initial value manager with inline diagnostics).
  - Undo/redo toolbar, reset sample button, unsaved changes indicator, project statistics pill, editable project title with inline draft commit/revert, and dismissible polite aria-live error message bar.
  - Pure file persistence: deterministic JSON project save and open (`lumio-project` format, schemaVersion 1) with 5MB byte size limits, format/version checks, version migration table, ProjectSchema validation, graph integrity validation, unknown keys warnings, Toolbar New/Open/Save triggers, and reference-based `isDirty` unsaved changes tracking with `beforeunload` warning.
- Vitest unit tests and `fast-check` property tests across all packages (258 tests passing: 81 in dsl, 59 in checker, 118 in web).
- Root gate script `pnpm check` verifying typecheck, lint, and tests across all packages.

## How to run
```bash
pnpm install
pnpm check
pnpm dev # runs apps/web via Vite dev server
```

## Environment
- Node: `v24.20.0` (pinned via `.nvmrc`)
- pnpm: `12.8.1`
- Postgres: not yet integrated / required
- Required env vars: none

## Known broken / not implemented
- Web Worker: checker currently runs synchronously on main thread inside `useMemo`.
- Server backend (`apps/server`), database, migrations, auth, and realtime collaboration not yet wired.
- No autosave or crash recovery (in-memory state lost on unconfirmed page reload; manual Save to file required).
- Browser save dialog cancellation cannot be detected: `savedPresent` marks clean when download triggers even if user cancels native save dialog.
- Multi-node selection / multi-delete not supported.
- Reconnecting existing edges by dragging their ends not supported (handle dragging creates new edges).
- Renaming or deleting variables does not rewrite expressions in conditions/effects.
- No import/export from third-party tools (Twine, Ink, Articy).

## Rollback
```bash
git switch -c recover/2026-10-04 7d909786de148d7253e91b356c534d54bd37c94a
```