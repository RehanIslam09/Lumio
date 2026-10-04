# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | 2026-10-04 |
| Branch | `main` |
| Commit | `98188eab06a64c5753e39418e89a431ffceeeded` |
| Tag | `stable-003` |
| Gate result | `pnpm check` passed (11/11 tasks successful: typecheck, lint, test with 161 Vitest/fast-check tests across 4 packages) |
| Approved by | Rehan Islam |

## What exists and works
- Monorepo with pnpm workspaces and Turborepo 2 (`tasks` config).
- Shared TypeScript strict base config (`tsconfig.base.json`) and root ESLint 10 flat configuration (`eslint.config.mjs`).
- `@repo/schema` package with Zod schemas and inferred types for `FlowNode` (with `position` refinement), `FlowEdge`, `Variable` (with `initial` value refinement), `Project`, `IssueRuleId`, `IssueSeverity`, `IssueLocation`, and `Issue` (XOR `nodeId`/`variableId` refinement).
- `@repo/dsl` pure package implementing hand-written lexer, recursive descent parser, AST traversal helpers (`collectReads`, `collectEffectUsage`), and static typechecker for conditions and effects with AST error spans, 200-depth nesting limit, cascade suppression, and silent top-level unknown handling.
- `@repo/checker` pure package implementing static analysis for unreachable nodes (`findUnreachableNodes`), nodes unable to reach end (`findNodesThatCannotReachEnd`), expression validation, typechecking, and variable usage rules (`unused-variable`, `variable-never-written`, `variable-never-read`).
- `@repo/web` frontend application (`apps/web`) with Vite 8, React 19, and `@xyflow/react` 12, featuring layered BFS node layout with orphan band, issue categorization, source code snippet extraction with error span highlighting, interactive syntax error toggle, and live checker diagnostics panel.
- Vitest unit tests and `fast-check` property tests across all packages (161 tests passing: 81 in dsl, 59 in checker, 21 in web).
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
- Canvas is read-only (node/edge editing, connection creation, and dragging not yet implemented).
- Web Worker: checker currently runs synchronously on main thread inside `useMemo`.
- Server backend (`apps/server`), database, migrations, auth, and realtime collaboration not yet wired.

## Rollback
```bash
git switch -c recover/2026-10-04 98188eab06a64c5753e39418e89a431ffceeeded
```