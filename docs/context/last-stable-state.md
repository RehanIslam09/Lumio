# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | 2026-10-03 |
| Branch | `main` |
| Commit | `5296eec57cf865bf7a8069e06fed4f040a5947ab` |
| Tag | `stable-001` |
| Gate result | `pnpm check` passed (5/5 tasks successful: typecheck, lint, test with 11 Vitest/fast-check tests) |
| Approved by | Rehan Islam |

## What exists and works
- Monorepo walking skeleton with pnpm workspaces and Turborepo 2 (`tasks` config).
- Shared TypeScript strict base config (`tsconfig.base.json`) and root ESLint 10 flat configuration (`eslint.config.mjs`).
- `@repo/schema` package with Zod schemas and inferred types for `FlowNode`, `FlowEdge`, and `Project`.
- `@repo/checker` pure package implementing `findUnreachableNodes`.
- Vitest unit tests and `fast-check` property tests for graph reachability (11 tests passing).
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
- DSL package (`packages/dsl`) and export package (`packages/export`) not yet created.
- Database, migrations, auth, and realtime collaboration not yet wired.

## Rollback
```bash
git switch -c recover/2026-10-03 5296eec57cf865bf7a8069e06fed4f040a5947ab
```