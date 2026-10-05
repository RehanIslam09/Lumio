# ARCHITECTURE

> [!warning] Status legend
> `DECIDED` = binding. `DRAFT` = proposal, ask before building on it. `TODO` = not designed yet.
> Agents: update the Repo map (section 3) whenever files are added, moved, or deleted.

## Index
1. Overview `DECIDED`
2. Stack `DRAFT`
3. Repo map `DRAFT`
4. Data model `DRAFT`
5. DSL (conditions and effects) `DECIDED`
6. Consistency checker `DRAFT`
7. UI `DECIDED`
8. Editor state `DECIDED`
9. Realtime collaboration `DRAFT`
10. Persistence `DECIDED`
11. Export format `TODO`
12. Open questions

## 1. Overview `DECIDED`
A web tool for writers of large, non-linear game narratives. Two graphs:
- **Flow graph:** scenes/dialogue nodes, choice edges with conditions and effects. Executable (playtest mode).
- **Lore graph:** characters, factions, places, events, with typed relationships. Mostly explored, lightly edited.

Core differentiator: an automated **consistency checker** (static analysis over the flow graph, later across lore). Secondary: real-time co-editing and a writer-first UI.

## 2. Stack `DRAFT`
| Concern | Choice | Status |
|---|---|---|
| Language | TypeScript (strict) | DECIDED |
| Frontend | React + Vite | DECIDED |
| Graph editor | React Flow (@xyflow/react) for flow graph; Sigma.js/Cytoscape for large lore graph | DECIDED |
| Rich text | Tiptap + Yjs | DRAFT |
| Realtime | Yjs + Hocuspocus | DRAFT |
| Backend | Node + Hono, Zod | DECIDED |
| DB | PostgreSQL (native Windows dev DB) | DECIDED |
| ORM | Drizzle + node-postgres | DECIDED |
| Auth | Better Auth or Clerk | TODO |

| Monorepo | pnpm + Turborepo | DRAFT |
| Tests | Vitest, fast-check, Playwright | DRAFT |

### Development database
- Engine: PostgreSQL (installed natively on Windows)
- Databases: `lumio`, `lumio_test`
- Role: `lumio`
- Port: `5432`
- Connection string format (no password): `postgresql://lumio:<password>@localhost:5432/lumio`
- Rule: Native Windows development only (NO WSL, NO Docker, NO containers).

## 3. Repo map `DRAFT`
```text
.editorconfig
.gitattributes
.gitignore
.nvmrc
eslint.config.mjs
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
README.md
tsconfig.base.json
turbo.json
apps/
  server/       Hono backend (`src/config.ts`, `src/app.ts`, `src/index.ts`), Drizzle ORM schema & migrations (`drizzle.config.ts`, `drizzle/`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/migrate-cli.ts`), DB test safety (`src/db/testSafety.ts`), and integration tests (`src/db/*.int.test.ts`)
  web/          React Flow story canvas, live checker diagnostics, pure editor state (`src/editor/`), pure persistence module (`src/persistence/`), pure lib helpers (`src/lib/`), camera hook (`src/hooks/`), and UI components
packages/
  schema/       Zod types: FlowNode, FlowEdge, Project, Issue, Variable
  checker/      Graph analysis (pure): unreachable, dead ends, invalid expression, typecheck rules + tests
  dsl/          Language parser & typechecker (pure): AST, lexer, parser, typechecker for conditions and effects + tests
docs/
  RULES.md  ARCHITECTURE.md  context/
.agent/workflows/
AGENTS.md
```
<!-- Agents: replace this block with the real tree once code exists; keep one line per file/dir that matters. -->

## 4. Data model `DECIDED`

### Relational Schema (PostgreSQL via Drizzle ORM)
- **`users`**:
  - `id`: `uuid` PRIMARY KEY DEFAULT `gen_random_uuid()`
  - `email`: `text` NOT NULL, UNIQUE (`users_email_unique`)
  - `password_hash`: `text` NOT NULL
  - `created_at`: `timestamptz` NOT NULL DEFAULT `now()`
  - Constraints:
    - CHECK `users_email_normalized_check`: `email = lower(btrim(email))`
    - CHECK `users_email_shape_check`: `char_length(email) between 3 and 254 and position('@' in email) > 1`
    - CHECK `users_password_hash_not_empty_check`: `char_length(password_hash) > 0`

- **`projects`**:
  - `id`: `uuid` PRIMARY KEY DEFAULT `gen_random_uuid()`
  - `owner_id`: `uuid` NOT NULL, FK `projects_owner_id_fkey` -> `users(id)` ON DELETE CASCADE
  - `name`: `text` NOT NULL
  - `created_at`: `timestamptz` NOT NULL DEFAULT `now()`
  - `updated_at`: `timestamptz` NOT NULL DEFAULT `now()`
  - Constraints & Indexes:
    - CHECK `projects_name_length_check`: `char_length(btrim(name)) between 1 and 200`
    - INDEX `projects_owner_updated_idx` ON `(owner_id, updated_at DESC)`

- **`project_versions`**:
  - `id`: `uuid` PRIMARY KEY DEFAULT `gen_random_uuid()`
  - `project_id`: `uuid` NOT NULL, FK `project_versions_project_id_fkey` -> `projects(id)` ON DELETE CASCADE
  - `version_number`: `integer` NOT NULL
  - `schema_version`: `integer` NOT NULL
  - `document`: `jsonb` NOT NULL (typed as `unknown` in Drizzle; validated at application boundary in next task)
  - `created_by`: `uuid` NULL, FK `project_versions_created_by_fkey` -> `users(id)` ON DELETE SET NULL
  - `created_at`: `timestamptz` NOT NULL DEFAULT `now()`
  - Constraints & Indexes:
    - UNIQUE `project_versions_project_version_unique` ON `(project_id, version_number)`
    - CHECK `project_versions_version_number_check`: `version_number >= 1`
    - CHECK `project_versions_schema_version_check`: `schema_version >= 1`
    - CHECK `project_versions_document_object_check`: `jsonb_typeof(document) = 'object'`
    - CHECK `project_versions_document_size_check`: `octet_length(document::text) <= 5000000` (named constant `MAX_DOCUMENT_BYTES = 5_000_000` mirroring web file limit)
    - INDEX `project_versions_created_by_idx` ON `(created_by)`

### Rules & Semantic Constraints
- **Version numbering:** Assigned per-project by the application as `max + 1` under a project row lock in the next task; contiguity is not enforced by the database.
- **U+0000 rejection:** PostgreSQL jsonb parser rejects strings containing `\u0000` with SQLSTATE `22P05`; the next task must reject or strip `\u0000` before insert.
- **Document size limit measure:** The database checks `octet_length(document::text)` (PostgreSQL's canonical JSONB text representation), not raw HTTP upload bytes. The next task must enforce a request-body size limit before JSON parsing.

### Migrations
- Tooling: `drizzle-kit` (`db:generate` via `drizzle.config.ts`, dialect: postgresql).
- Strategy: Forward-only, committed SQL migrations under `apps/server/drizzle/`.
- Runtime: `runMigrations(db)` applies committed migrations idempotently using `drizzle-orm/node-postgres/migrator`. CLI script: `pnpm --filter @repo/server db:migrate` via `src/db/migrate-cli.ts`.

### Database Tests
- Safety guard: `checkTestDatabaseUrl(testUrl, devUrl)` in `src/db/testSafety.ts` refuses non-test DBs (must end with `_test`), non-localhost hosts, or collision with dev DB. Never leaks credentials in failure reasons.
- Fail-loudly rule: DB tests fail loudly (never skip) with clear instructions when `TEST_DATABASE_URL` is missing or the database is unreachable.
- Test isolation: Clean slate on each run by recreating schemas (`public` and `drizzle`), running `runMigrations`, and truncating tables `CASCADE` between tests. `fileParallelism: false` configured in `vitest.config.ts`. `TEST_DATABASE_URL` is loaded via native `process.loadEnvFile`.


## 5. DSL `DECIDED`
Small expression language for edge conditions and effects. Pure hand-written lexer, recursive descent parser, and typechecker in `@repo/dsl`. Parsed and interpreted, never executed as code (R8.3).

Grammar (lowest to highest precedence, all binary operators left-associative):
```text
expr       := or
or         := and ( "||" and )*
and        := equality ( "&&" equality )*
equality   := relational ( ("==" | "!=") relational )*
relational := additive ( ("<" | "<=" | ">" | ">=") additive )*
additive   := term ( ("+" | "-") term )*
term       := unary ( ("*" | "/") unary )*
unary      := ("!" | "-") unary | primary
primary    := NUMBER | STRING | "true" | "false" | IDENT | "(" expr ")"
effect     := IDENT ( "=" | "+=" | "-=" ) expr
```
Maximum nesting depth: 200 (counting each nested `(` and each chained unary operator). Exceeding it returns `ParseError` without throwing.

### Typing rules summary
- `Type`: `"number"` | `"string"` | `"boolean"` | `"unknown"`. `TypeEnv`: `ReadonlyMap<string, VariableType>`. Duplicate names in environment: first wins.
- Literals: `NUMBER` -> `"number"`, `STRING` -> `"string"`, `BOOL` -> `"boolean"`.
- Identifier: type from env; if absent -> reports `undefined-variable` at identifier span with type `"unknown"`.
- Unary operators:
  - `!`: expects `"boolean"` -> `"boolean"`.
  - `-`: expects `"number"` -> `"number"`.
- Binary operators:
  - `+`: (`number`, `number`) -> `"number"`; (`string`, `string`) -> `"string"`.
  - `-`, `*`, `/`: (`number`, `number`) -> `"number"`.
  - `<`, `<=`, `>`, `>=`: (`number`, `number`) -> `"boolean"` (strings not allowed).
  - `==`, `!=`: both operands same type -> `"boolean"`.
  - `&&`, `||`: (`boolean`, `boolean`) -> `"boolean"`.
- Cascade suppression: `"unknown"` is silent. If any operand of an operator is `"unknown"`, the operator emits no issue and assumes its natural result type (`+` yields `"unknown"`). After a genuine mismatch, the operator node also assumes its natural result type (`+` -> `"unknown"`).
- Top-level silent unknown: if condition evaluates to `"unknown"`, no condition-boolean mismatch is reported; if effect value evaluates to `"unknown"`, no assignment compatibility mismatch is reported.
- Condition check: if final type is known and not `"boolean"`, reports `type-mismatch` across the full condition expression span.
- Effect check: target identifier must exist in env (else `undefined-variable` at target span, skipping value compatibility). Assignment rules:
  - `=`: value type === target type.
  - `+=`: (`number`, `number`) or (`string`, `string`).
  - `-=`: (`number`, `number`).
  Mismatch span is `effect.value` span.
- Output issues are ordered by start offset, then end offset.

### Variable usage helpers (`@repo/dsl`)
- `collectReads(expr: Expr): Identifier[]`: collects identifier reads in source order.
- `collectEffectUsage(effect: Effect): { write: Identifier; reads: Identifier[] }`: returns target identifier as write, and `collectReads(effect.value)` as reads. Compound operators (`+=`, `-=`) do not add target to reads.

## 6. Consistency checker `DRAFT`
Pure function: `check(project) -> Issue[]`. Runs in a Web Worker (live) and on the server (pre-export).

### Issue model
```ts
interface IssueLocation {
  edgeId: string;
  field: "condition" | "effect";
  effectIndex?: number;
  start: number;
  end: number;
}

interface Issue {
  ruleId:
    | "unreachable-from-start"
    | "cannot-reach-end"
    | "invalid-expression"
    | "undefined-variable"
    | "type-mismatch"
    | "unused-variable"
    | "variable-never-written"
    | "variable-never-read";
  severity: "error" | "warning";
  nodeId?: string;
  variableId?: string;
  message: string;
  location?: IssueLocation;
}
```
Refinement: exactly one of `nodeId` or `variableId` must be present (`(nodeId !== undefined) !== (variableId !== undefined)`).

### Rules table
| Rule | Algorithm | Phase |
|---|---|---|
| Unreachable from start (`unreachable-from-start`) | Forward BFS from start nodes | v1 (implemented) |
| Cannot reach end (`cannot-reach-end`) | Reverse BFS from end nodes (covers dead ends and trap cycles; Tarjan SCC postponed) | v1 (implemented) |
| Invalid expression (`invalid-expression`) | Syntax validation via `@repo/dsl` lexer and parser on edge conditions and effects | v1 (implemented) |
| Undefined variables (`undefined-variable`) | Symbol table & typecheck over parsed DSL on edge conditions and effects | v1 (implemented) |
| Type mismatch (`type-mismatch`) | Pure static typechecker over parsed DSL conditions and effect assignments | v1 (implemented) |
| Unused variable (`unused-variable`) | Warning when declared variable is never read and never written | v1 (implemented) |
| Variable never written (`variable-never-written`) | Warning when declared variable without `initial` is read but never written | v1 (implemented) |
| Variable never read (`variable-never-read`) | Warning when declared variable is written but never read | v1 (implemented) |
| Dead effects (set, never read) | def-use analysis | v2 |
| Conflicting or impossible conditions | path-sensitive state/interval analysis | v2 |
| Lore contradictions | typed-relation rules | later |
Policy: under-report. A false positive costs more trust than a false negative.

### Known limitations
- Reachability limitation: variable usage is counted across all edges in `project.edges`, even edges whose source node is unreachable from any start node or edges with invalid/dangling `from` nodes.
- Parse error suppression: a single unparseable condition or effect on any edge suppresses all variable-usage issues across the entire project to prevent false positives.

## 7. UI `DECIDED`
Interactive story canvas and narrative authoring environment built with React, Vite, and `@xyflow/react` (`apps/web`).
- **Graph Layout (`computeLayout`):** Pure deterministic layered layout algorithm using named constants `HORIZONTAL_GAP = 380` and `VERTICAL_GAP = 140`. Nodes with explicit `position` keep it exactly. Reachable nodes are placed in horizontal layers determined by the shortest path from start nodes (`x = layer * HORIZONTAL_GAP`, `y = indexInLayer * VERTICAL_GAP`). Unreachable nodes without explicit position occupy an orphan grid below the main flow: `mainLayerCount = startNodeIds.length === 0 ? 0 : maxReachableLayer + 1`, `columns = Math.max(3, mainLayerCount)`, `bandTop = maxAutoInMainLayer === 0 ? 0 : maxAutoInMainLayer * VERTICAL_GAP + VERTICAL_GAP`; orphan `i`: `column = i % columns`, `row = Math.floor(i / columns)`, `x = column * HORIZONTAL_GAP`, `y = bandTop + row * VERTICAL_GAP`. Explicit positions on orphans are kept and do not consume grid slots.
- **Initial Camera & Viewport (`computeInitialViewport`, `useInitialViewport`):**
  - **Opening Rule (fit vs start):** Determines initial viewport based on fit readability. If `fitZoom >= 0.6` (`FIT_READABLE_THRESHOLD`), mode is `'fit'`, centering the bounding box of all positioned nodes with zoom clamped to `[MIN_ZOOM, MAX_ZOOM]`. Otherwise, mode is `'start'`, focusing the first start node (or first positioned node) at readable zoom (`READABLE_ZOOM = 0.85`), placing its left edge at `VIEW_PADDING = 48` on screen and vertically centered in the canvas.
  - **Named Constants:** `READABLE_ZOOM = 0.85`, `FIT_READABLE_THRESHOLD = 0.6`, `FIT_MAX_ZOOM = 1`, `VIEW_PADDING = 48`, `MIN_ZOOM = 0.1`, `MAX_ZOOM = 2`, `PAN_DURATION = 400`.
  - **Camera Reset Lifecycle (`loadCounter`):** Canvas camera applies exactly once per `loadCounter` value via `shouldApplyInitialViewport` when canvas dimensions are measured (`width > 0` and `height > 0`). `loadCounter` increments on: initial mount, Open (success), New project, and Reset sample. The camera must NOT reset or move on graph edits, undo, redo, node drags, or issue clicks. Canvas starts with `visibility: hidden` until the first viewport is applied (with a 1000ms safety net timeout), preventing flashes of default unscaled views.
  - **"Go to start" Control:** Rendered via `ControlButton` inside `<Controls>` next to the fit button with a flag SVG icon and accessible name/title "Go to start". Re-applies `computeInitialViewport` on current project and canvas dimensions with a 400ms pan animation (`PAN_DURATION`), while preserving existing fit-view functionality.
- **Custom Nodes (`StoryNode`):** Displays node title, type chip (start, scene, end), and error/warning count badges from node-level issues. Exports named dimension constants `STORY_NODE_WIDTH` (220) and `STORY_NODE_HEIGHT` (88) as single source of truth for initial dimensions and inline styles.
- **Custom Edges (`StoryEdge`):** Uses `BaseEdge` and `EdgeLabelRenderer`. Labels render compact condition pills truncated with ellipsis and full tooltip on hover, plus `fx N` effect chips. Does not intercept panning (`nodrag nopan`). Clicking edge label selects the edge.
- **MiniMap:** Color-coded node shapes (red for errors, amber for warnings, green/purple/indigo by node type).
- **Editing Flow & Canvas Integration:**
  - Nodes are draggable in controlled mode via transient `dragOverrides` Map. On drag stop, compares final coordinates against pre-drag rendered layout position; dispatches ONE `moveNode` only if coordinates changed.
  - Adding nodes places new node at the center of the visible canvas (`screenToFlowPosition` offset by half node dimensions).
  - Handle-to-handle dragging completes connections via `addEdge` with `makeEdge`. Node handles are enlarged to 14px with hover growth (`scale: 1.2`), distinct outline focus, and `<ReactFlow connectionRadius={30} />` to maximize target hit area.
  - Non-blocking dismissible tip overlay (`pointer-events: none` container with `pointer-events: auto` dismiss button) guides users on node handle dragging without blocking canvas interactions or overlapping Controls / MiniMap.
  - Single deletion path: React Flow's `deleteKeyCode` is disabled (`null`). Global key listener uses pure `interpretKey` to intercept `Delete` / `Backspace` when non-editable canvas targets have focus, dispatching `deleteNode` or `deleteEdge` on current selection.
- **Selection Model:**
  - Single source of truth `{ kind: 'node' | 'edge', id: string } | null` in App.
  - Derived valid selection automatically clears if selected entity is deleted or removed via undo.
  - Tab rule: selecting a node or edge on canvas switches right sidebar to Inspector tab; clicking an issue in Issues tab selects and focuses target on canvas without switching tabs.
- **Draft & Commit Rules:**
  - Input fields and textareas maintain local draft state while user is editing.
  - Values commit to editor state only on `blur` or `Enter` (`Ctrl+Enter` in multiline textareas). `Escape` reverts to committed value. Unchanged drafts commit nothing.
  - Under condition and effect fields, live diagnostics from pure `draftCheck` highlight syntax/type problem spans in real time without committing.
- **Right Sidebar Tabs (420px):**
  - **Issues Tab:** Grouped consistency diagnostics (Errors, Warnings, Variables) with code snippets and click-to-focus camera panning.
  - **Inspector Tab:**
    - Contextual inspector for selected Node: ID, title, type, explicit/auto position with clear button, Connections section (incoming/outgoing edge rows with direction arrow, destination title or `(missing node)`, condition summary, `fx N` chip, and click-to-focus; empty state messaging; and "Connect to…" dropdown + Connect button dispatching `addEdge` via `makeEdge`), and delete button.
    - Contextual inspector for selected Edge: "Go to source" and "Go to target" navigation buttons with click-to-focus (disabled on dangling references), ID, source, target, condition, editable effects list, delete button, inline edge issues.
  - **Variables Tab:** Variable manager with name, type selector, initial value controls (number, string, boolean checkbox, or clear/set initial toggle), inline variable issues, and deletion. Incompatible type switches surface editor error in dismissible message bar.

## 8. Editor state `DECIDED`
Pure TypeScript editor state module with undo/redo history and referential integrity (`apps/web/src/editor/`).
Completely isolated from React, DOM, and browser APIs; imports only from `@repo/schema`. Mutates data structures; does not evaluate DSL or compute checker diagnostics.

### Types
```ts
interface EditorState {
  present: Project;
  past: Project[]; // capped at 100 entries (FIFO eviction)
  future: Project[];
}

type EditorAction =
  | { type: "renameProject"; name: string }
  | { type: "addNode"; node: FlowNode }
  | { type: "updateNode"; id: string; patch: { title?: string; type?: FlowNode["type"]; position?: { x: number; y: number } | null } }
  | { type: "moveNode"; id: string; position: { x: number; y: number } }
  | { type: "deleteNode"; id: string }
  | { type: "addEdge"; edge: FlowEdge }
  | { type: "updateEdge"; id: string; patch: { from?: string; to?: string; condition?: string | null; effects?: string[] | null } }
  | { type: "deleteEdge"; id: string }
  | { type: "addVariable"; variable: Variable }
  | { type: "updateVariable"; id: string; patch: { name?: string; type?: Variable["type"]; initial?: Variable["initial"] | null } }
  | { type: "deleteVariable"; id: string };

type ApplyResult =
  | { ok: true; state: EditorState }
  | { ok: false; error: EditorError };

interface EditorError {
  code: "not-found" | "duplicate-id" | "invalid" | "dangling-reference";
  message: string;
}
```

### Public functions
- `createEditor(project: Project): EditorState`: initializes state with empty past and future.
- `apply(state: EditorState, action: EditorAction): ApplyResult`: validates and applies an action immutably.
- `undo(state: EditorState): EditorState`: pops previous state from past, moves present to future.
- `redo(state: EditorState): EditorState`: shifts next state from future, moves present to past.
- `canUndo(state: EditorState): boolean`, `canRedo(state: EditorState): boolean`.
- `nextId(existingIds: readonly string[], prefix: string): string`: finds lowest unused integer `n >= 1` for `${prefix}_${n}`.

### Semantics
- **Immutability & Structural Sharing:** Untouched entities and unmodified collection arrays preserve strict reference equality (`Object.is`).
- **Validation:** Changed entities are validated via `safeParse` against Zod schemas from `@repo/schema`. The parsed output is stored in the new state. Validation failures return `{ ok: false, error: { code: 'invalid', message } }` without mutating state or pushing history.
- **Referential Integrity:** `addEdge` and `updateEdge` check that `from` and `to` nodes exist in `present.nodes` (else `'dangling-reference'`). `deleteNode` automatically cascade-deletes all incident incoming and outgoing edges in a single atomic history step (one `undo` restores node and edges together). Self-loops and parallel edges are allowed.
- **Variable Initial Value Integrity:** Changing a variable's `type` without providing a compatible `initial` or removing it via `initial: null` returns `'invalid'`. Unique variable names are not enforced by the editor.
- **No-op Detection:** Changes deep-equal to the current state via internal `structurallyEqual` helper (key-order independent, undefined/missing key equivalence) return `{ ok: true, state }` with the exact same state reference and do not push history.
- **History Cap:** Capped at 100 entries in `past`. When exceeded, the oldest entry is dropped (FIFO). Any successful non-no-op action clears `future`.

## 9. Realtime collaboration `DRAFT`
Yjs documents per project/node, Hocuspocus server, awareness for cursors and presence. Persistence to Postgres via Hocuspocus extension. Auth on WebSocket connect (R8.1).

## 10. Persistence `DECIDED`
File-based project save and open workflow implemented via pure persistence module (`apps/web/src/persistence/`).
- **File Format v1:**
  - Structure: `{ format: "lumio-project", schemaVersion: 1, exportedAt: string, project: Project }`.
  - Serialized as deterministic UTF-8 JSON with 2-space indentation and trailing newline.
  - File naming: `${slug}.lumio.json` where slug is lowercase alphanumeric, spaces/symbols collapsed to single `-`, leading/trailing dashes removed, max 60 chars (fallback: `project.lumio.json`).
- **Limits & Error Handling:**
  - Maximum file size: 5,000,000 UTF-8 bytes (`MAX_FILE_BYTES`). Larger files rejected with `'too-large'` before `JSON.parse`.
  - Parse error taxonomy:
    - `'too-large'`: byte length exceeds 5 MB.
    - `'not-json'`: JSON syntax error.
    - `'wrong-format'`: non-object, missing/invalid `format` marker, or non-positive integer `schemaVersion`.
    - `'unsupported-version'`: `schemaVersion` greater than current supported version.
    - `'invalid-project'`: schema validation failure against `ProjectSchema` (capped at 10 dot-joined path details + remaining count).
    - `'integrity'`: referential integrity or ID collision failure.
- **Integrity Policy:**
  - Enforces unique node IDs, unique edge IDs, unique variable IDs, and valid source/target node references across all edges.
  - Variable name duplicates are permitted (handled by consistency checker).
  - Unknown keys: stripped properties on top-level project, nodes, edges, or variables are detected and reported as non-fatal warnings.
- **Migration Registry:**
  - Version-keyed table `MIGRATIONS: Record<number, MigrationFn>` executes forward data transforms when loading legacy versions up to `CURRENT_SCHEMA_VERSION`.
- **Dirty Tracking:**
  - `isDirty(state, savedPresent)` performs strict reference comparison (`state.present !== savedPresent`).
  - Saved baseline updates on Save, Open, New project, and Sample reset.
  - Controls "Unsaved changes" toolbar badge, `beforeunload` browser prompt, and confirmation dialogs on destructive actions.

## 11. Export format `TODO`
Versioned JSON (`schemaVersion`), documented schema, validated by Zod (R3.5).

## 12. Open questions & technical debt
- Whether flow nodes are one Yjs doc each or one per project
- DSL grammar scope for v1
- **Database layer technical debt (S2 / W-020):**
  - No `ProjectSchema` validation at database level (`document` is stored as `jsonb` object; app validates in next task)
  - `updated_at` timestamp is updated by application logic, no database trigger
  - No soft delete (hard cascading deletes on foreign keys)
  - No sharing or granular collaborator roles yet
  - `MAX_DOCUMENT_BYTES` (5 MB) duplicates the web client file limit (`MAX_FILE_BYTES`)
  - Database counts the jsonb TEXT form (not raw upload bytes), so the next task must also enforce a request-body size limit before JSON parsing
  - No connection retry or exponential backoff in client pool
  - Migrations are forward-only (no down migrations)
  - No automated backup or restore procedures
  - U+0000 limitation: PostgreSQL rejects `\u0000` in jsonb strings (SQLSTATE `22P05`); app must reject or sanitize before insert
  - DB integration tests require local PostgreSQL 18 service running on localhost:5432 and fail loudly without it