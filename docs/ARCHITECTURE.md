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
| Frontend | React + Vite | DRAFT |
| Graph editor | React Flow; Sigma.js/Cytoscape for large lore graph | DRAFT |
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
packages/
  schema/       Zod types: FlowNode, FlowEdge, Project
  checker/      Graph analysis (pure): findUnreachableNodes + tests
docs/
  RULES.md  ARCHITECTURE.md  context/
.agent/workflows/
AGENTS.md
```
<!-- Agents: replace this block with the real tree once code exists; keep one line per file/dir that matters. -->

## 4. Data model `DRAFT`
| Entity | Key fields | Notes |
|---|---|---|
| Project | id, name, ownerId | |
| Member | projectId, userId, role (viewer/writer/lead) | |
| FlowNode | id, projectId, type, title, body (rich text), position | `type`: scene, dialogue, branch, start, end |
| FlowEdge | id, from, to, label, condition (DSL), effects (DSL[]) | |
| Variable | id, projectId, name, type, initial | Referenced by DSL |
| Entity | id, projectId, kind (character/faction/place/event), name, attributes (JSONB) | Rename/delete must cascade-warn |
| Relation | id, fromEntityId, toEntityId, type, attributes | Typed edge in lore graph |
| NodeEntityLink | nodeId, entityId | Connects flow and lore layers |
| NodeVersion | nodeId, version, snapshot, authorId, createdAt | Per-node history |

## 5. DSL `TODO`
Small expression language for edge conditions and effects. Grammar, types, and operators to be designed. Must be parsed and interpreted, never executed as code (R8.3).

## 6. Consistency checker `DRAFT`
Pure function: `check(project) -> Issue[]`. Runs in a Web Worker (live) and on the server (pre-export).
| Rule | Algorithm | Phase |
|---|---|---|
| Unreachable nodes | BFS/DFS from start nodes | v1 |
| Dead ends / unintended loops | out-degree, Tarjan SCC | v1 |
| Undefined variables | symbol table over parsed DSL | v1 |
| Dead effects (set, never read) | def-use analysis | v2 |
| Conflicting or impossible conditions | path-sensitive state/interval analysis | v2 |
| Lore contradictions | typed-relation rules | later |
Policy: under-report. A false positive costs more trust than a false negative (v1 ships only the first three rules).

## 7. Realtime collaboration `DRAFT`
Yjs documents per project/node, Hocuspocus server, awareness for cursors and presence. Persistence to Postgres via Hocuspocus extension. Auth on WebSocket connect (R8.1).

## 8. Export format `TODO`
Versioned JSON (`schemaVersion`), documented schema, validated by Zod (R3.5).

## 9. Open questions
- ORM choice (Drizzle vs Prisma)
- Whether flow nodes are one Yjs doc each or one per project
- DSL grammar scope for v1