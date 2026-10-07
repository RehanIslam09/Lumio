# LAST STABLE STATE

> [!important] Only `/promote-stable` may edit this file.
> It records the last commit where the full gate passed and a human approved. If the current branch is broken, this is the rollback target.

| Field | Value |
|---|---|
| Promoted on | 2026-10-07 |
| Branch | `main` |
| Commit | `2a79caf` |
| Tag | `stable-009` |
| Gate result | W-027 gate passed: 14/14 tasks successful, 599 tests passing; W-027 build passed; manual schema v2 migration, cloud persistence, history restore, and history download checks passed. |
| Approved by | Rehan Islam |

## What exists and works
- Monorepo with pnpm workspaces and Turborepo 2 (`tasks` config).
- Shared TypeScript strict base config (`tsconfig.base.json`) and root ESLint 10 flat configuration (`eslint.config.mjs`).
- `@repo/schema` package with Zod schemas and inferred types for `FlowNode` (with `position` refinement), `FlowEdge` (with optional `condition` and `effects`), `Variable` (with `initial` value refinement), `Project`, `IssueRuleId`, `IssueSeverity`, `IssueLocation`, and `Issue` (XOR `nodeId`/`variableId` refinement).
- `@repo/dsl` pure package implementing hand-written lexer, recursive descent parser, AST traversal helpers (`collectReads`, `collectEffectUsage`), and static typechecker for conditions and effects with AST error spans, 200-depth nesting limit, cascade suppression, and silent top-level unknown handling.
- `@repo/checker` pure package implementing static analysis for unreachable nodes (`findUnreachableNodes`), nodes unable to reach end (`findNodesThatCannotReachEnd`), expression validation, typechecking, and variable usage rules (`unused-variable`, `variable-never-written`, `variable-never-read`).
- `@repo/web` frontend application (`apps/web`):
  - Pure TypeScript editor state module (`apps/web/src/editor`) with linear undo/redo history (capped at 100), referential integrity cascade deletion, validation against `@repo/schema`, no-op detection via structural equality, and 11 distinct action handlers.
  - Pure utility modules (`flowModel`, `defaults`, `draftCheck`, `keymap`, `layout`, `decorate`, `snippet`, `connections`, `persistence`, `initialViewport`) with 144 unit and property tests.
  - Interactive story canvas built on `@xyflow/react` 12: node dragging with transient drag coordinates and single-step commit on move, enlarged 14px handles with relaxed 30px connection radius, duplicate/self-loop rejection, non-blocking dismissible tip overlay, click-to-focus and pan animations, readable initial camera (0.85 zoom on start node for large graphs, fit-view for small graphs), orphan grid layout below main flow, and "Go to start" button in Controls.
  - 3-tab sidebar: Issues tab (grouped errors/warnings/variables with code snippets and click-to-focus), Inspector tab (contextual node title/type/content/position and edge condition/effects with live syntax & type validation, incoming/outgoing connections with edge focus and Connect-to dropdown, edge navigation buttons to jump to source or target), and Variables tab (name, type, initial value manager with inline diagnostics).
  - Undo/redo toolbar, reset sample button, unsaved changes indicator, project statistics pill, editable project title with inline draft commit/revert, and dismissible polite aria-live error message bar.
  - Pure file persistence: deterministic JSON project save and open (`lumio-project` format, schemaVersion 1) with 5MB byte size limits, format/version checks, version migration table, ProjectSchema validation, graph integrity validation, unknown keys warnings, Toolbar New/Open/Save triggers, and reference-based `isDirty` unsaved changes tracking with `beforeunload` warning.
- `@repo/server` backend application (`apps/server`):
  - Hono HTTP server running on Node with `@hono/node-server`, validated config parser (`DATABASE_URL`, port, `NODE_ENV`, CORS origins allowlist, `SESSION_TTL_DAYS`), `/health` endpoint, JSON 404/500 error handlers, and graceful shutdown.
  - PostgreSQL database layer using Drizzle ORM and `node-postgres` with committed forward-only SQL migrations (`0000_salty_trauma.sql`, `0001_public_firedrake.sql`), client factory with connection pool limits, safety guard against running tests against non-test databases, and 11 database integrity tests against `lumio_test`.
  - Database schema: `users` (id, email, password_hash, created_at), `projects` (id, owner_id FK cascade, title, created_at, updated_at), `project_versions` (id, project_id FK cascade, version 1..N, document jsonb with 5 MB octet check constraint, created_at), and `sessions` (id, token_hash unique with shape check, user_id FK cascade, expires_at with expiry check, created_at).
  - Authentication and session management: Argon2id password hashing (`@node-rs/argon2`), 32-byte cryptographically secure session tokens hashed with SHA-256, session fixation defense, session trimming (max 10 per user), sliding-window in-memory rate limiting with capacity eviction, timing parity dummy hash for nonexistent users, CSRF origin check, 16 KB body limit, and httpOnly cookie management with production `__Host-` prefix.
  - Composition root (`composeApp`) wiring real database, Drizzle repositories, Argon2 hasher, auth service, and routes.
- Vitest unit tests and `fast-check` property tests across all packages (375 tests passing: 81 in dsl, 59 checker, 144 in web, 91 in server).
- Root gate script `pnpm check` verifying typecheck, lint, and tests across all packages.

## How to run
```bash
pnpm install
pnpm check
pnpm dev # runs apps/web via Vite dev server
pnpm dev:server # runs apps/server via tsx (requires local PostgreSQL with DATABASE_URL)
```

## Environment
- Node: `v24.20.0` (pinned via `.nvmrc`)
- pnpm: `12.8.1`
- Postgres: PostgreSQL 18 (native Windows dev DB running on `localhost:5432` with databases `lumio` and `lumio_test`)
- Required env vars:
  - `apps/server/.env`: `DATABASE_URL=postgres://postgres:<password>@localhost:5432/lumio`
  - `apps/server/.env` (for test suite): `TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/lumio_test`

## Known broken / not implemented
- Web Worker: checker currently runs synchronously on main thread inside `useMemo`.
- Project CRUD services and HTTP endpoints in `apps/server` not yet implemented (database tables and migrations exist).
- Realtime collaboration (WebSocket / Yjs / Hocuspocus) not yet wired.
- Web client not yet connected to backend server or auth endpoints (currently uses file persistence).
- No email verification, password reset, or session list / revocation UI.
- Unbounded concurrent Argon2 hashing can exhaust memory under extreme load (rate limits reduce risk).
- In-memory rate limiter is per-process (not shared across cluster instances).
- PostgreSQL rejects `\u0000` in jsonb strings (SQLSTATE `22P05`).
- Browser save dialog cancellation cannot be detected: `savedPresent` marks clean when download triggers even if user cancels native save dialog.
- Multi-node selection / multi-delete not supported in canvas.
- Reconnecting existing edges by dragging their ends not supported (handle dragging creates new edges).
- Renaming or deleting variables does not rewrite expressions in conditions/effects.
- No import/export from third-party tools (Twine, Ink, Articy).

## Rollback
```bash
git switch -c recover/2026-10-05 ccc3d70c70f28cbd1c97c6e9af2faa09f1e5c5b3
```


stable-007:
- Persistence fully implemented
- Conflict resolution (keep mine) working
- Dirty state tracking stable
- Tests: 496 passing
- Gate: 14/14, 0 cached
stable-008:
- Version history UI implemented
- Restore and download supported
- Stale-generation guards fixed
- Tests: 550 passing
- Gate: 14/14, 0 cached

stable-009:
- Schema v2 implemented with entities, node body, and speaker support
- v1 → v2 migration with current-version write policy
- v1 golden fixtures and migration/property/round-trip coverage added
- Cloud persistence preserves old v1 versions and creates new v2 versions
- History restore and download verified
- W-027 build: JS 594.26 kB (gzip 177.33 kB), CSS 38.78 kB (gzip 6.93 kB)
- Tests: 599 passing
- Gate: 14/14
- Commit: `2a79caf`

stable-010:
- Entities panel with character, location, and item management
- Node body editing with 20,000 code-point cap
- Speaker assignment to character entities
- Entity rename, description, kind-change validation, and duplicate-name warnings
- Cascade speaker cleanup on entity deletion with single-step undo
- Draft fields keyed by node/entity/edge id to prevent stale draft leakage
- W-028 editor tests: 49 passing
- Browser validation: B1-B12 passed
- Commit: `2392dcf`

stable-011:
- Entity-based checker rules implemented
- Added invalid-speaker, speaker-without-text, character-never-speaks, and duplicate-entity-name rules
- Issues can be anchored to entities via `entityId`
- Entity issue navigation from Issues tab implemented
- Checker/UI parity tests and property-test coverage added
- W-029 checker tests: 82 passing
- Commit: `721b94b`
- Tag: `stable-011`
