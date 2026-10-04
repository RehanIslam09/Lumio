# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | 2026-10-04 |
| Branch | `main` |
| Commit | `f34bb71eaf0526ae96a1191e52ce946358807df4` |
| Tag | `stable-004` |
| Gate result | `pnpm check -- --force` passed (11/11 tasks successful: typecheck, lint, test with 227 Vitest/fast-check tests across 4 packages) |
| Approved by | Rehan Islam |

## What exists and works
- Monorepo with pnpm workspaces and Turborepo 2 (`tasks` config).
- Shared TypeScript strict base config (`tsconfig.base.json`) and root ESLint 10 flat configuration (`eslint.config.mjs`).
- `@repo/schema` package with Zod schemas and inferred types for `FlowNode` (with `position` refinement), `FlowEdge` (with optional `condition` and `effects`), `Variable` (with `initial` value refinement), `Project`, `IssueRuleId`, `IssueSeverity`, `IssueLocation`, and `Issue` (XOR `nodeId`/`variableId` refinement).
- `@repo/dsl` pure package implementing hand-written lexer, recursive descent parser, AST traversal helpers (`collectReads`, `collectEffectUsage`), and static typechecker for conditions and effects with AST error spans, 200-depth nesting limit, cascade suppression, and silent top-level unknown handling.
- `@repo/checker` pure package implementing static analysis for unreachable nodes (`findUnreachableNodes`), nodes unable to reach end (`findNodesThatCannotReachEnd`), expression validation, typechecking, and variable usage rules (`unused-variable`, `variable-never-written`, `variable-never-read`).
- `@repo/web` frontend application (`apps/web`):
  - Pure TypeScript editor state module (`apps/web/src/editor`) with linear undo/redo history (capped at 100), referential integrity cascade deletion, validation against `@repo/schema`, no-op detection via structural equality, and 11 distinct action handlers.
  - Pure utility modules (`flowModel`, `defaults`, `draftCheck`, `keymap`, `layout`, `decorate`, `snippet`) with 87 unit and property tests.
  - Interactive story canvas built on `@xyflow/react` 12: node dragging with transient drag coordinates and single-step commit on move, handle-to-handle connection with duplicate/self-loop rejection, click-to-focus and pan animations.
  - 3-tab sidebar: Issues tab (grouped errors/warnings/variables with code snippets and click-to-focus), Inspector tab (contextual node title/type/content/position and edge condition/effects with live syntax & type validation), and Variables tab (name, type, initial value manager with inline diagnostics).
  - Undo/redo toolbar, reset sample button, unsaved changes indicator, project statistics pill, and dismissible polite aria-live error message bar.
- Vitest unit tests and `fast-check` property tests across all packages (227 tests passing: 81 in dsl, 59 in checker, 87 in web).
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
- No persistence (editor state is in-memory; resets on page reload).
- No export/import (JSON serialization/deserialization not yet implemented).
- Multi-node selection / multi-delete not supported.
- Reconnecting existing edges not supported (handle dragging creates new edges).
- Renaming or deleting variables does not rewrite expressions in conditions/effects.

## Rollback
```bash
git switch -c recover/2026-10-04 f34bb71eaf0526ae96a1191e52ce946358807df4
```