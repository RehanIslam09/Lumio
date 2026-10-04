# RECENT WORK

> [!important] Rolling log. Newest entry first. Read fully at session start.
> **Cap:** at most **8 full entries**. When adding a 9th, `/finish-task` moves the oldest full entry to `work-archive.md` and leaves a one-line summary under "Older work".
> **Write facts, not narration.** No entry without real command output.

## Entry template (copy for each task)
```markdown
### W-### | YYYY-MM-DD | <short title>
- **Status:** DONE | PARTIAL | BLOCKED
- **Git:** uncommitted (user commits manually). Suggested message: `<type: summary>`
- **Goal:** <one sentence>
- **Files changed:**
  - `path/to/file.ts`: <what changed, one line>
- **New/changed public APIs:** <exported names with signatures, or "none">
- **Decisions and why:** <bullets; cite rule IDs / ARCHITECTURE sections>
- **Assumptions / UNVERIFIED:** <bullets, or "none">
- **Verification:** `<command>` -> <pass/fail + key lines of real output>
- **Known issues / debt:** <bullets, or "none">
- **Next steps:** <bullets>
```

---

## Entries

### W-005 | 2026-10-04 | DSL typechecker and checker rules: invalid-expression, undefined-variable, type-mismatch
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `feat(checker): implement DSL typechecker and expression consistency rules`
- **Goal:** Implement pure DSL typechecker in @repo/dsl, extend Issue schema with location in @repo/schema, wire invalid-expression, undefined-variable, and type-mismatch rules into check() in @repo/checker, fix parser token comparisons with isPunct, and validate with comprehensive unit and property tests.
- **Files changed:**
  - `packages/schema/src/index.ts`: added IssueLocationSchema, IssueLocation type, and updated IssueRuleIdSchema / IssueSchema with location field
  - `packages/dsl/src/parser.ts`: added isPunct helper and audited all operator/punctuation comparisons to eliminate raw `tok.value ===` checks
  - `packages/dsl/src/typechecker.ts`: implemented pure typechecker with cascade suppression and silent top-level unknown handling (`buildTypeEnv`, `typecheckCondition`, `typecheckEffect`)
  - `packages/dsl/src/index.ts`: exported typechecker types and functions
  - `packages/dsl/src/index.test.ts`: added regression tests for operator/keyword string literals, strengthened Property 1 generator, cleaned linting/types without any, added unit and property tests (T1-T3)
  - `packages/checker/package.json`: added workspace dependency `@repo/dsl: "workspace:*"`
  - `packages/checker/src/index.ts`: wired invalid-expression, undefined-variable, and type-mismatch rules into `check()`
  - `packages/checker/src/index.test.ts`: updated Property test B duplicate key to include location, added rule unit tests, updated effect error span expectation and ordering sequence, added Property C1
  - `pnpm-lock.yaml`: updated workspace dependency wiring
  - `docs/ARCHITECTURE.md`: updated Repo map, Section 5 typing rules summary, Section 6 consistency checker table and Issue shape
  - `docs/context/recent-work.md`: logged entry W-005
- **New/changed public APIs:**
  - `@repo/schema`:
    - `IssueLocationSchema: z.ZodObject<{ edgeId, field, effectIndex?, start, end }>`
    - `type IssueLocation = { edgeId: string; field: 'condition' | 'effect'; effectIndex?: number; start: number; end: number; }`
    - `IssueRuleIdSchema`: added `"invalid-expression" | "undefined-variable" | "type-mismatch"`
    - `IssueSchema`: added optional `location?: IssueLocation`
  - `@repo/dsl`:
    - `type Type = VariableType | "unknown"`
    - `type TypeEnv = ReadonlyMap<string, VariableType>`
    - `type TypeIssue = { code: 'undefined-variable' | 'type-mismatch'; message: string; start: number; end: number; }`
    - `buildTypeEnv(variables: Variable[]): TypeEnv`
    - `typecheckCondition(expr: Expr, env: TypeEnv): TypeIssue[]`
    - `typecheckEffect(effect: Effect, env: TypeEnv): TypeIssue[]`
  - `@repo/checker`:
    - `check(project: Project): Issue[]` outputs node-based issues followed by edge-based issues with locations.
- **Defect found in W-004:**
  - *What the bug was:* `parseUnary` in `packages/dsl/src/parser.ts` tested `if (tok.value === "!" || tok.value === "-")` without verifying `tok.type === "PUNCT"`. As a result, a string literal whose content was `"!"` or `"-"` (tokenized as `{ type: "STRING", value: "!" }`) was mistakenly interpreted as a unary operator token, consumed, and followed by an unexpected EOF looking for an operand. Similar unvalidated `tok.value` checks existed across binary operators.
  - *Why old tests missed it:* W-004 property and unit tests generated string literals composed of character sequences, but didn't specifically test standalone string literals equal to operator or keyword symbols (e.g. `"!"`, `"-"`, `"=="`).
  - *What now guards against it:* All parser operator checks now use `isPunct(tok, ...values)` requiring `tok.type === "PUNCT"`. Regression tests explicitly test each operator, punctuation, and keyword symbol as string literals in conditions and effects, and Property 1's string generator draws directly from this operator/keyword set.
- **Decisions and why:**
  - Implemented cascade suppression so `unknown` operand types yield no cascading errors and propagate natural result types (`+` yields `unknown`).
  - Silent unknown at top level prevents spurious "must be boolean" or effect assignment mismatches when root causes are undefined variables.
  - Edge-based issues set `nodeId = edge.from` and populate `location` with exact offsets within the source expression.
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm exec turbo run typecheck lint test --force --continue` -> pass (8/8 tasks successful across 3 packages, 109 tests passing)
- **Known issues / debt:** none
- **Next steps:**
  - Integrate AST evaluator or AST interpreter for playtest execution mode.

### W-004 | 2026-10-03 | DSL v1: Schema additions + pure lexer & parser
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `feat(dsl): implement condition and effect lexer, parser, and schema updates`
- **Goal:** Add Variable schema, optional condition/effects on FlowEdge, and variables on Project in @repo/schema; create pure @repo/dsl package with hand-written lexer and recursive descent parser for conditions and effects; add unit and fast-check property tests; update architecture docs.
- **Files changed:**
  - `docs/RULES.md`: added clarifying sentence to R3.3 (domain/persisted types in schema; AST types in dsl)
  - `packages/schema/src/index.ts`: added Variable schema/type, updated FlowEdge with optional condition/effects, updated Project with variables
  - `packages/checker/src/index.test.ts`: added variables: [] to Project fixtures without altering test logic
  - `packages/dsl/package.json`: workspace package configuration for @repo/dsl
  - `packages/dsl/tsconfig.json`: TypeScript configuration extending root base
  - `packages/dsl/src/ast.ts`: AST definitions (Expr, Effect, Span, ParseResult, ParseError)
  - `packages/dsl/src/lexer.ts`: hand-written lexer with exact error offsets and escape handling
  - `packages/dsl/src/parser.ts`: hand-written recursive descent parser for conditions and effects with 200 nesting limit
  - `packages/dsl/src/index.ts`: public exports
  - `packages/dsl/src/index.test.ts`: 27 tests (literals, precedence, associativity, error spans, nesting limit, round-trip and robustness property tests)
  - `pnpm-lock.yaml`: updated due to new @repo/dsl workspace package wiring (no new external dependencies)
  - `docs/ARCHITECTURE.md`: updated Repo map, Section 4 (data model), and Section 5 (DSL marked DECIDED)
  - `docs/context/recent-work.md`: logged entry W-004
- **New/changed public APIs:**
  - `@repo/schema`:
    - `VariableTypeSchema: z.ZodEnum<["number", "string", "boolean"]>`
    - `type VariableType = "number" | "string" | "boolean"`
    - `VariableNameSchema: z.ZodString` (validates `^[A-Za-z_][A-Za-z0-9_]*$` and excludes `"true"`/`"false"`)
    - `VariableSchema: z.ZodObject<{ id: z.ZodString, name: VariableNameSchema, type: VariableTypeSchema }>`
    - `type Variable = { id: string; name: string; type: VariableType; }`
    - `FlowEdgeSchema` updated with optional `condition?: z.ZodString` and `effects?: z.ZodArray<z.ZodString>`
    - `ProjectSchema` updated with `variables: z.ZodArray<VariableSchema>`
  - `@repo/dsl`:
    - `type Expr = NumberLit | StringLit | BoolLit | Identifier | Unary | Binary`
    - `type Effect = { target: Identifier; op: "=" | "+=" | "-="; value: Expr; start: number; end: number; }`
    - `type ParseError = { message: string; start: number; end: number; }`
    - `type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError }`
    - `parseCondition(source: string): ParseResult<Expr>`
    - `parseEffect(source: string): ParseResult<Effect>`
- **Decisions and why:**
  - Hand-crafted lexer and recursive descent parser without third-party dependencies to keep @repo/dsl pure and lightweight (R2.4, R4.1).
  - Explicit nesting limit of 200 enforced without throwing RangeError, returning ParseError directly at the offending token span.
  - Retained strict pure boundaries: AST types live in `@repo/dsl`, while persistent entity models live in `@repo/schema` (R3.3 clarification in RULES.md).
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm exec turbo run typecheck lint test --force` -> pass
    ```text
    @repo/schema:lint: $ eslint .
    @repo/dsl:lint: $ eslint .
    @repo/checker:lint: $ eslint .
    @repo/schema:typecheck: $ tsc --noEmit
    @repo/checker:test: $ vitest run
    @repo/dsl:typecheck: $ tsc --noEmit
    @repo/dsl:test: $ vitest run
    @repo/checker:typecheck: $ tsc --noEmit
    ✓ src/index.test.ts (25 tests) 95ms
    ✓ src/index.test.ts (27 tests) 51ms
    Tasks: 8 successful, 8 total
    Cached: 0 cached, 8 total
    Time: 2.651s
    ```
- **Known issues / debt:** none
- **Next steps:**
  - Build DSL typechecker and wire undefined variable consistency checker rule.

### W-003 | 2026-10-03 | Checker v1 structure: Issue model, check() entry point, second rule
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `feat(checker): implement Issue model, cannot-reach-end rule, and check entry point`
- **Goal:** Add Issue schema/type in @repo/schema, implement findNodesThatCannotReachEnd and check() in @repo/checker with unit and fast-check property tests, and update architecture docs.
- **Files changed:**
  - `packages/schema/src/index.ts`: added IssueRuleIdSchema, IssueSeveritySchema, IssueSchema and their inferred types
  - `packages/checker/src/index.ts`: added internal shared BFS helper, exported findNodesThatCannotReachEnd and check()
  - `packages/checker/src/index.test.ts`: kept 11 existing tests unchanged, added 8 unit tests for findNodesThatCannotReachEnd, 4 unit tests for check(), and 2 property tests (differential fixpoint and invariants)
  - `docs/ARCHITECTURE.md`: updated Repo map and Section 6 consistency checker table noting Tarjan SCC postponement
  - `docs/context/recent-work.md`: logged entry W-003
- **New/changed public APIs:**
  - `@repo/schema`:
    - `IssueRuleIdSchema: z.ZodEnum<["unreachable-from-start", "cannot-reach-end"]>`
    - `type IssueRuleId = "unreachable-from-start" | "cannot-reach-end"`
    - `IssueSeveritySchema: z.ZodEnum<["error", "warning"]>`
    - `type IssueSeverity = "error" | "warning"`
    - `IssueSchema: z.ZodObject<{ ruleId: IssueRuleIdSchema, severity: IssueSeveritySchema, nodeId: z.ZodString, message: z.ZodString }>`
    - `type Issue = { ruleId: IssueRuleId; severity: IssueSeverity; nodeId: string; message: string; }`
  - `@repo/checker`:
    - `findUnreachableNodes(project: Project): string[]` (retained)
    - `findNodesThatCannotReachEnd(project: Project): string[]`
    - `check(project: Project): Issue[]`
- **Decisions and why:**
  - Consolidated BFS traversal into an internal unexported helper `findUnconnectedNodes` to avoid code duplication across rules while preserving purity and package boundaries (R3.4, R4.1).
  - Preserved `project.nodes` ordering and eliminated duplicates by filtering existing nodes directly.
  - Implemented Property test A with an independent naive fixpoint iterative edge saturation algorithm in the test file to ensure true differential testing against the BFS implementation (R5.2).
  - Postponed Tarjan SCC per ARCHITECTURE section 6 update since `cannot-reach-end` covers dead ends and trap cycles.
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm exec turbo run typecheck lint test --force` -> pass
    ```text
    @repo/checker:lint: $ eslint .
    @repo/schema:typecheck: $ tsc --noEmit
    @repo/schema:lint: $ eslint .
    @repo/checker:typecheck: $ tsc --noEmit
    @repo/checker:test: $ vitest run
    ✓ src/index.test.ts (25 tests) 44ms
    Tasks: 5 successful, 5 total
    Cached: 0 cached, 5 total
    Time: 1.613s
    ```
- **Known issues / debt:** none
- **Next steps:**
  - Implement undefined variable checking rule when DSL expression package is designed.

### W-002 | 2026-10-03 | Promote commit 5296eec as stable-001
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `docs: record stable-001 promotion at commit 5296eec`
- **Goal:** Promote walking skeleton commit `5296eec` as first stable baseline (`stable-001`) via `/promote-stable` workflow.
- **Files changed:**
  - `docs/context/last-stable-state.md`: updated to record stable-001 (commit 5296eec) baseline, gate result, capabilities, environment, and rollback instructions
  - `docs/context/recent-work.md`: added entry W-002 documenting the promotion
- **New/changed public APIs:** none
- **Decisions and why:**
  - Verified working tree clean and gate passing before user confirmation per `/promote-stable`.
  - Did not execute `git tag` per R6.1; provided tag command for user manual execution (`git tag stable-001 5296eec57cf865bf7a8069e06fed4f040a5947ab`).
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm check -- --force` -> pass
    ```text
    @repo/checker:lint: $ eslint .
    @repo/schema:typecheck: $ tsc --noEmit
    @repo/schema:lint: $ eslint .
    @repo/checker:typecheck: $ tsc --noEmit
    @repo/checker:test: $ vitest run
    ✓ src/index.test.ts (11 tests) 26ms
    Tasks: 5 successful, 5 total
    Cached: 0 cached, 5 total
    Time: 1.577s
    ```
- **Known issues / debt:** none
- **Next steps:**
  - User to tag commit with `git tag stable-001 5296eec57cf865bf7a8069e06fed4f040a5947ab`.

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

## Older work (one line each; full detail in work-archive.md)
- none yet