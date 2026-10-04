# WORK ARCHIVE

> [!info] Do NOT read by default. Open only when a `recent-work.md` entry points here or you are debugging history.
> Full entries rotated out of `recent-work.md`, newest at the top. Same template as `recent-work.md`.

### W-001 | 2026-10-03 | Monorepo bootstrap and pure packages skeleton
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `chore: bootstrap monorepo skeleton with schema and checker packages`
- **Goal:** Bootstrap monorepo walking skeleton with pnpm workspace, Turborepo, strict TypeScript, ESLint 10, packages/schema, and pure packages/checker with unit and fast-check tests.
- **Files changed:**
  - `.editorconfig`: created with LF, 2 spaces indent, final newline
  - `.gitattributes`: created with `* text=auto eol=lf`
  - `.gitignore`: created covering node_modules, build outputs, and `.env` (R6.3)
  - `.nvmrc`: created pinning Node version to 24
  - `package.json`: root workspace manifest with pinned tool dependencies and check scripts
  - `pnpm-workspace.yaml`: workspace config pointing to `packages/*`
  - `turbo.json`: Turborepo v2 configuration with `tasks`
  - `tsconfig.base.json`: shared strict base TypeScript configuration (R3.1)
  - `eslint.config.mjs`: ESLint flat configuration using native `defineConfig` and `@typescript-eslint` strict
  - `packages/schema/package.json`: package manifest for `@repo/schema` with zod 4.6.5
  - `packages/schema/tsconfig.json`: TypeScript configuration extending root base
  - `packages/schema/src/index.ts`: FlowNode, FlowEdge, and Project Zod schemas and inferred types (R3.2, R3.3)
  - `packages/checker/package.json`: package manifest for `@repo/checker` with vitest and fast-check
  - `packages/checker/tsconfig.json`: TypeScript configuration extending root base
  - `packages/checker/src/index.ts`: pure `findUnreachableNodes` implementation (R3.4, R4.1)
  - `packages/checker/src/index.test.ts`: Vitest unit tests and fast-check property test (R5.2)
  - `README.md`: repository setup, gate instructions, and folder layout
  - `docs/ARCHITECTURE.md`: updated Repo map to real tree (R7.3)
  - `docs/context/recent-work.md`: logged entry W-001
- **New/changed public APIs:**
  - `@repo/schema`:
    - `FlowNodeTypeSchema: z.ZodEnum<["start", "scene", "end"]>`
    - `type FlowNodeType = "start" | "scene" | "end"`
    - `FlowNodeSchema: z.ZodObject<{ id: z.ZodString, type: FlowNodeTypeSchema, title: z.ZodString }>`
    - `type FlowNode = { id: string; type: FlowNodeType; title: string; }`
    - `FlowEdgeSchema: z.ZodObject<{ id: z.ZodString, from: z.ZodString, to: z.ZodString }>`
    - `type FlowEdge = { id: string; from: string; to: string; }`
    - `ProjectSchema: z.ZodObject<{ id: z.ZodString, name: z.ZodString, nodes: z.ZodArray<FlowNodeSchema>, edges: z.ZodArray<FlowEdgeSchema> }>`
    - `type Project = { id: string; name: string; nodes: FlowNode[]; edges: FlowEdge[]; }`
  - `@repo/checker`:
    - `findUnreachableNodes(project: Project): string[]`
- **Decisions and why:**
  - Used Turborepo v2 `"tasks"` format instead of deprecated `"pipeline"` (Turborepo 2 standard).
  - Used ESLint native `defineConfig` from `"eslint/config"` because `tseslint.config()` is deprecated in `typescript-eslint` v8.
  - Dependencies pinned to exact versions without `^` or `~` per user instruction.
  - Zod 4.6.5, TypeScript 6.0.3, ESLint 10.12.0 selected based on latest versions satisfying all peer dependencies.
  - `findUnreachableNodes` ignores nonexistent edge endpoints and preserves `project.nodes` ordering without duplicates.
- **Assumptions / UNVERIFIED:**
  - none
- **Verification:**
  - `pnpm check -- --force` -> pass
    ```text
    @repo/schema:typecheck: $ tsc --noEmit
    @repo/checker:lint: $ eslint .
    @repo/schema:lint: $ eslint .
    @repo/checker:test: $ vitest run
    @repo/checker:typecheck: $ tsc --noEmit
    ✓ src/index.test.ts (11 tests) 32ms
    Tasks: 5 successful, 5 total
    Cached: 0 cached, 5 total
    Time: 1.718s
    ```
- **Known issues / debt:**
  - none
- **Next steps:**
  - Promote to stable via `/promote-stable` after user review and manual commit.

### W-000 | 2026-10-01 | Agent operating docs created
- **Status:** DONE
- **Git:** n/a (docs only)
- **Goal:** Establish AGENTS.md, RULES.md, ARCHITECTURE.md, context files, and workflows.
- **Files changed:**
  - `AGENTS.md`, `docs/RULES.md`, `docs/ARCHITECTURE.md`: created
  - `docs/context/*`: created
  - `.agent/workflows/*`: created
- **New/changed public APIs:** none
- **Decisions and why:** Rolling log with archive to keep always-read context small.
- **Assumptions / UNVERIFIED:** `pnpm check` script does not exist yet; must be created in the first coding task.
- **Verification:** n/a
- **Known issues / debt:** ARCHITECTURE sections are mostly DRAFT.
- **Next steps:** Bootstrap monorepo; create `pnpm check`; fill `last-stable-state.md` after first green gate.