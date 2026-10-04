# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | 2026-10-04 |
| Branch | `main` |
| Commit | `d9d7b35eef65a59abfdb4329f8dc5423177801e1` |
| Tag | `stable-002` |
| Gate result | `pnpm check` passed (8/8 tasks successful: typecheck, lint, test with 109 Vitest/fast-check tests) |
| Approved by | Rehan Islam |

## What exists and works
- Monorepo with pnpm workspaces and Turborepo 2 (`tasks` config).
- Shared TypeScript strict base config (`tsconfig.base.json`) and root ESLint 10 flat configuration (`eslint.config.mjs`).
- `@repo/schema` package with Zod schemas and inferred types for `FlowNode`, `FlowEdge`, `Variable`, `Project`, `IssueRuleId`, `IssueSeverity`, `IssueLocation`, and `Issue`.
- `@repo/dsl` pure package implementing hand-written lexer, recursive descent parser, and static typechecker for conditions and effects with AST error spans, 200-depth nesting limit, cascade suppression, and silent top-level unknown handling.
- `@repo/checker` pure package implementing static analysis for unreachable nodes (`findUnreachableNodes`), nodes unable to reach end (`findNodesThatCannotReachEnd`), and `check()` entry point reporting `unreachable-from-start`, `cannot-reach-end`, `invalid-expression`, `undefined-variable`, and `type-mismatch`.
- Vitest unit tests and `fast-check` property tests across all packages (109 tests passing: 74 in dsl, 35 in checker).
- Root gate script `pnpm check` verifying typecheck, lint, and tests across all packages.

## How to run
```bash
pnpm install
pnpm check
```

## Environment
- Node: `v24.20.0` (pinned via `.nvmrc`)
- pnpm: `12.8.1`
- Postgres: not yet integrated / required
- Required env vars: none

## Known broken / not implemented
- Frontend (`apps/web`) and backend server (`apps/server`) not yet created.
- Export package (`packages/export`) not yet created.
- Database, migrations, auth, and realtime collaboration not yet wired.

## Rollback
```bash
git switch -c recover/2026-10-04 d9d7b35eef65a59abfdb4329f8dc5423177801e1
```