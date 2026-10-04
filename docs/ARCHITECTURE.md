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
10. Export format `TODO`
11. Open questions

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
| Backend | Node + Hono or Fastify, Zod | DRAFT |
| DB | PostgreSQL | DRAFT |
| ORM | Drizzle or Prisma | TODO |
| Auth | Better Auth or Clerk | TODO |
| Monorepo | pnpm + Turborepo | DRAFT |
| Tests | Vitest, fast-check, Playwright | DRAFT |

<!-- FILL: change DRAFT -> DECIDED as you commit to each choice -->

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
  web/          React Flow story canvas, live checker diagnostics, pure editor state (`src/editor/`), pure lib helpers (`src/lib/`), Inspector connection components, and sidebar tabs
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

## 4. Data model `DRAFT`
| Entity | Key fields | Notes |
|---|---|---|
| Project | id, name, nodes, edges, variables, ownerId | |
| Member | projectId, userId, role (viewer/writer/lead) | |
| FlowNode | id, projectId, type, title, body (rich text), position (optional { x: number, y: number }) | `type`: scene, dialogue, branch, start, end; position coordinates must be finite |
| FlowEdge | id, from, to, label, condition (optional string), effects (optional string[]) | |
| Variable | id, name, type ('number' \| 'string' \| 'boolean'), initial (optional number \| string \| boolean) | Referenced by DSL; initial type must match type and numbers must be finite |
| Entity | id, projectId, kind (character/faction/place/event), name, attributes (JSONB) | Rename/delete must cascade-warn |
| Relation | id, fromEntityId, toEntityId, type, attributes | Typed edge in lore graph |
| NodeEntityLink | nodeId, entityId | Connects flow and lore layers |
| NodeVersion | nodeId, version, snapshot, authorId, createdAt | Per-node history |

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
- **Graph Layout (`computeLayout`):** Pure deterministic layered layout algorithm. Nodes with explicit `position` keep it exactly. Reachable nodes are placed in layers determined by the shortest path from start nodes (`x = layer * 380`, `y = index * 140`). Unreachable nodes occupy an orphan band (`maxLayer + 2`).
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

## 10. Export format `TODO`
Versioned JSON (`schemaVersion`), documented schema, validated by Zod (R3.5).

## 11. Open questions
- ORM choice (Drizzle vs Prisma)
- Whether flow nodes are one Yjs doc each or one per project
- DSL grammar scope for v1