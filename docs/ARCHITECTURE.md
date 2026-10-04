# ARCHITECTURE

> [!warning] Status legend
> `DECIDED` = binding. `DRAFT` = proposal, ask before building on it. `TODO` = not designed yet.
> Agents: update the Repo map (section 3) whenever files are added, moved, or deleted.

## Index
1. Overview `DECIDED`
2. Stack `DRAFT`
3. Repo map `DRAFT`
4. Data model `DRAFT`
5. DSL (conditions and effects) `TODO`
6. Consistency checker `DRAFT`
7. Realtime collaboration `DRAFT`
8. Export format `TODO`
9. Open questions

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
  web/          Read-only React Flow story canvas + live checker issues panel
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
Read-only story canvas built with React, Vite, and `@xyflow/react` (`apps/web`).
- **Graph Layout (`computeLayout`):** Pure deterministic layered layout algorithm. Nodes with explicit `position` keep it exactly. Reachable nodes are placed in layers determined by the shortest path from start nodes (`x = layer * 280`, `y = index * 140`). Unreachable nodes occupy an orphan band (`maxLayer + 2`).
- **Custom Nodes (`StoryNode`):** Displays node title, type chip (start, scene, end), and error/warning count badges from node-level issues.
- **Edges:** Labels display condition text and effect counts. Edges with issues are styled with error color and animated flow.
- **Issues Panel (`IssuesPanel`):** Live consistency diagnostics from `check(project)`, categorized into Errors, Warnings, and Variable Issues. Clicking an issue focuses and centers the corresponding node or edge on the canvas and highlights source code spans for edge condition/effect errors (`getIssueSnippet`).

## 8. Realtime collaboration `DRAFT`
Yjs documents per project/node, Hocuspocus server, awareness for cursors and presence. Persistence to Postgres via Hocuspocus extension. Auth on WebSocket connect (R8.1).

## 9. Export format `TODO`
Versioned JSON (`schemaVersion`), documented schema, validated by Zod (R3.5).

## 10. Open questions
- ORM choice (Drizzle vs Prisma)
- Whether flow nodes are one Yjs doc each or one per project
- DSL grammar scope for v1