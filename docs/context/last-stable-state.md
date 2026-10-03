# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | <!-- FILL: YYYY-MM-DD --> |
| Branch | `main` |
| Commit | <!-- FILL: full hash --> |
| Tag | <!-- FILL: e.g. stable-001 --> |
| Gate result | <!-- FILL: `pnpm check` summary --> |
| Approved by | <!-- FILL: name --> |

## What exists and works
<!-- FILL: bullets of user-visible / developer-visible capabilities at this commit -->
- Nothing yet (pre-code).

## How to run
```bash
# FILL once the repo exists
pnpm install
pnpm dev
pnpm check
```

## Environment
<!-- FILL: Node version, pnpm version, Postgres version, required env vars (names only, never values) -->

## Known broken / not implemented
<!-- FILL -->
- Everything. Project is at bootstrap.

## Rollback
```bash
git switch -c recover/<date> <stable-commit-hash>
```