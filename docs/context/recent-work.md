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

### W-010 | 2026-10-04 | UI polish pass for apps/web story canvas and diagnostics panel
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `fix(web): UI polish pass for viewport fit, minimap, edge labels, and issues panel`
- **Goal:** Fix 5 visual issues in apps/web: initial viewport fit & fit-view, MiniMap node rendering, compact edge condition/effects labels with layer spacing, horizontal scrolling prevention in issues panel, and animated pan-to-focus for off-screen targets.
- **Files changed:**
  - `apps/web/src/components/StoryNode.tsx`: defined and exported `STORY_NODE_WIDTH = 220` and `STORY_NODE_HEIGHT = 88` constants, applied inline width style.
  - `apps/web/src/components/StoryEdge.tsx`: created custom edge rendering `nodrag nopan` edge label container with compact condition pill (max-width 140px, text ellipsis, tooltip) and `fx N` count badge.
  - `apps/web/src/lib/layout.ts`: increased horizontal layer gap from 280 to 380 per approved spec change.
  - `apps/web/src/lib/layout.test.ts`: updated numeric layer gap test expectations from 280 to 380.
  - `apps/web/src/index.css`: fixed issues panel width to 420px with `overflow-x: hidden`, added `overflow-wrap: anywhere` on message and target tags, scoped code snippet horizontal scrolling, and styled custom edge label pill and badge.
  - `apps/web/src/App.tsx`: registered `StoryEdge`, provided `initialWidth` and `initialHeight` on nodes to fix React Flow dimension measurement and MiniMap rendering, configured `minZoom={0.1}`, `fitViewOptions={{ padding: 0.08, minZoom: 0.1 }}`, configured MiniMap `nodeColor` callback (error/warn/type colors), and implemented animated `setCenter` pan for off-screen focus targets.
  - `docs/ARCHITECTURE.md`: updated Section 7 (UI) and file map with StoryEdge and node dimension constants.
  - `docs/context/work-archive.md`: archived full W-002 entry per rolling 8-entry cap.
  - `docs/context/recent-work.md`: logged entry W-010, rotated W-002 to older work.
- **New/changed public APIs:**
  - `apps/web/src/components/StoryNode.tsx`: `export const STORY_NODE_WIDTH = 220`, `export const STORY_NODE_HEIGHT = 88`
  - `apps/web/src/components/StoryEdge.tsx`: `export function StoryEdge(props: EdgeProps): JSX.Element`
- **Decisions and why:**
  - Used named constants `STORY_NODE_WIDTH` and `STORY_NODE_HEIGHT` in `StoryNode.tsx` and imported them in `App.tsx` for `initialWidth`/`initialHeight` to eliminate dimension mismatch between React Flow layout/MiniMap and CSS (R3.1).
  - Selected `minZoom=0.1` because the graph spans ~4020px with orphan band. In a 1280px viewport minus 420px panel (860px canvas), fitting 4020px with padding requires ~0.17 zoom; 0.1 provides comfortable headroom while preventing truncation.
  - Configured edge label container with `nodrag nopan` so clicking condition pill selects edge without panning or dragging graph canvas.
  - Animated `setCenter` over 400ms preserves current zoom unless unreadably small (<0.65, zoomed to 0.75).
- **Assumptions / UNVERIFIED:**
  - Visual verification with Playwright agent was unconfirmed due to azureedge CDN driver 404; code analysis and gate tests confirmed root causes.
- **Verification:**
  - `pnpm exec turbo run typecheck lint test --force --continue` -> pass (11/11 tasks successful across 4 packages, 161 tests passing: 81 dsl, 59 checker, 21 web)
  - `pnpm --filter @repo/web build` -> pass (built in 169ms, 0 errors)
- **Known issues / debt:** none
- **Next steps:**
  - User to review screenshot verification instructions and commit changes manually.

### W-009 | 2026-10-04 | Promote commit 98188ea as stable-003
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `docs: record stable-003 promotion at commit 98188ea`
- **Goal:** Promote commit `98188ea` as third stable baseline (`stable-003`) via `/promote-stable` workflow.
- **Files changed:**
  - `docs/context/last-stable-state.md`: updated to record stable-003 baseline (commit 98188ea), gate result, capabilities, environment, and rollback instructions
  - `docs/context/recent-work.md`: added entry W-009 documenting the promotion and rotated older entries
  - `docs/context/work-archive.md`: archived full entries W-001 and W-000 per R7.4 rolling window cap
- **New/changed public APIs:** none
- **Decisions and why:**
  - Verified working tree clean and gate passing before user confirmation per `/promote-stable`.
  - Did not execute `git tag` per R6.1; provided tag command for user manual execution (`git tag stable-003 98188eab06a64c5753e39418e89a431ffceeeded`).
  - Rotated oldest full entries (W-001, W-000) to `work-archive.md` to maintain the rolling 8-entry cap in `recent-work.md` (R7.4).
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm check` -> pass (11/11 tasks successful across 4 packages, 161 tests passing)
- **Known issues / debt:** none
- **Next steps:**
  - User to tag commit with `git tag stable-003 98188eab06a64c5753e39418e89a431ffceeeded`.
  - User to commit docs and send "go" for task W-010.

### W-008 | 2026-10-04 | First UI: apps/web read-only story canvas with live checker
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `feat(web): implement read-only story canvas and live checker panel`
- **Goal:** Add FlowNode position schema refinement in @repo/schema; create apps/web using React, Vite, @xyflow/react, and TypeScript strict; implement pure layout, decorate, and snippet modules with unit and property tests; build dark-themed story canvas with live checker diagnostics, edge snippet highlighting, click-to-focus, and syntax error toggle.
- **Files changed:**
  - `packages/schema/src/index.ts`: added optional `position?: { x: number, y: number }` with finite refinement to `FlowNodeSchema`.
  - `packages/checker/src/index.test.ts`: added schema unit tests for `FlowNode.position`.
  - `pnpm-workspace.yaml`: added `'apps/*'` to `packages:`.
  - `turbo.json`: added `"build"` task for apps/web.
  - `package.json`: added root `"dev"` script (`pnpm --filter @repo/web dev`).
  - `.gitignore`: added `*.tsbuildinfo`.
  - `apps/web/package.json`: configured `@repo/web` with React 19.3, Vite 8.3, @xyflow/react 12.12, workspace dependencies, and pinned dev tools.
  - `apps/web/tsconfig.json`: configured TypeScript extending root base with Bundler resolution and React JSX.
  - `apps/web/vite.config.ts`: configured Vite with React plugin and Vitest node environment.
  - `apps/web/eslint.config.mjs`: configured ESLint extending root config with `eslint-plugin-react-hooks`.
  - `apps/web/src/vite-env.d.ts`: added Vite client type reference.
  - `apps/web/src/lib/layout.ts` & `layout.test.ts`: implemented pure layered BFS node layout with orphan band and position preservation; unit & property tested.
  - `apps/web/src/lib/decorate.ts` & `decorate.test.ts`: implemented issue categorization (node-level, edge-level, variable-level); unit & property tested.
  - `apps/web/src/lib/snippet.ts` & `snippet.test.ts`: implemented code snippet extraction with clamped highlight span for edge issues; unit tested.
  - `apps/web/src/demo/sampleProject.ts` & `sampleProject.test.ts`: created 15-node Genshin-style questline with 4 variables and deliberate issues triggering all checker rules, plus syntax error toggle.
  - `apps/web/src/components/StoryNode.tsx`: custom React Flow node with type chips and error/warning count badges.
  - `apps/web/src/components/IssuesPanel.tsx`: diagnostics panel grouped by Errors, Warnings, and Variables with snippet display and click-to-focus.
  - `apps/web/src/App.tsx`: main application tying React Flow canvas and live checker together with click-to-focus and syntax toggle.
  - `apps/web/src/main.tsx`, `apps/web/src/index.css`, `apps/web/index.html`: application entrypoint, dark mode styling tokens, and HTML shell.
  - `docs/ARCHITECTURE.md`: updated Sections 2, 3, 4, and added Section 7 UI.
  - `docs/context/recent-work.md`: logged entry W-008.
- **New/changed public APIs:**
  - `@repo/schema`:
    - `FlowNodePositionSchema: z.ZodObject<{ x: number, y: number }>`
    - `type FlowNodePosition = { x: number; y: number; }`
    - `FlowNodeSchema`: added optional `position?: FlowNodePosition` (finite coordinates).
  - `@repo/web` (`apps/web`):
    - `computeLayout(project: Project): Map<string, { x: number, y: number }>`
    - `groupIssues(project: Project, issues: Issue[]): { byNode, byEdge, byVariable }`
    - `getIssueSnippet(project: Project, issue: Issue): { text: string, start: number, end: number } | undefined`
- **Decisions and why:**
  - Added an interactive "Syntax error" toggle in the UI header to demonstrate both states: with syntax error OFF, all semantic and variable usage rules fire; with syntax error ON, `invalid-expression` fires and demonstrates the W-006 project-wide usage suppression rule.
  - Implemented click-to-focus using `useReactFlow.fitView` targeting node/edge coordinates with smooth camera transitions and active selection outlines.
  - Kept React components thin by extracting layout, issue grouping, and snippet extraction into pure, test-first utility modules.
- **Assumptions / UNVERIFIED:**
  - Automated browser rendering via `browser_subagent` could not complete due to Playwright driver download 404 in environment; dev server verified via HTTP 200 curl and exact manual verification steps provided.
- **Verification:**
  - `pnpm exec turbo run typecheck lint test --force --continue` -> pass (11/11 tasks successful across 4 packages, 161 tests passing: 81 dsl, 59 checker, 21 web).
  - `pnpm --filter @repo/web build` -> pass (built production bundle in 231ms).
  - `pnpm why vite` -> 1 version (`vite@8.3.2`).
- **Known issues / debt:**
  - Web Worker: checker currently runs synchronously on main thread inside `useMemo`; worker offloading is a future task.
  - Canvas is read-only (no editing, connecting, or dragging).
  - No persistence (sample project loaded in memory).
  - Own layout algorithm is basic (layered BFS without crossing minimization or custom curve routing).
- **Next steps:**
  - Implement canvas node/edge editing and interactive story authoring.

### W-007 | 2026-10-04 | Variable-usage analysis: initial values + usage rules (W-006 task spec)
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `feat(checker): implement variable usage analysis and initial values`
- **Goal:** Add optional `initial` value refinement to `VariableSchema`, update `IssueSchema` with optional `nodeId`, `variableId`, and XOR refinement; implement pure `collectReads` and `collectEffectUsage` in `@repo/dsl`; implement `unused-variable`, `variable-never-written`, and `variable-never-read` rules in `@repo/checker`; validate with schema, unit, and property tests (U1, U2).
- **Files changed:**
  - `packages/schema/src/index.ts`: added optional `initial` with refinement to `VariableSchema`; added usage rule IDs to `IssueRuleIdSchema`; added optional `variableId`, made `nodeId` optional, and added XOR refinement to `IssueSchema`.
  - `packages/dsl/src/usage.ts`: created pure AST traversal helpers `collectReads` (source order) and `collectEffectUsage` (compound operators `+=`/`-=` do not add target to reads).
  - `packages/dsl/src/index.ts`: exported `usage.ts`.
  - `packages/dsl/src/index.test.ts`: added unit tests for `collectReads` and `collectEffectUsage`.
  - `packages/checker/src/index.ts`: parsed conditions/effects across all edges, suppressed usage issues on parse errors, deduplicated variable declarations by first-declared, and emitted usage issues in `project.variables` order.
  - `packages/checker/src/index.test.ts`: adapted Property B for optional `nodeId` and XOR refinement, updated ordering test for variable-level issues, updated W-005 fixture to read `msg`, added schema refinement tests, rule unit tests, Property U1 differential test, and Property U2 robustness test.
  - `docs/ARCHITECTURE.md`: updated Sections 4, 5, 6 with variable `initial`, DSL usage helpers, updated Issue shape, rules table, and known limitations.
  - `docs/context/recent-work.md`: logged entry W-007.
- **New/changed public APIs:**
  - `@repo/schema`:
    - `VariableSchema`: gains optional `initial?: number | string | boolean` with refinement ensuring type match and finite numbers.
    - `IssueRuleIdSchema`: added `"unused-variable" | "variable-never-written" | "variable-never-read"`.
    - `IssueSchema`: `nodeId` is now optional; added optional `variableId: string`; refined so exactly one of `nodeId` or `variableId` is present. Any consumer (e.g. future UI) must handle variable-level issues.
  - `@repo/dsl`:
    - `collectReads(expr: Expr): Identifier[]`
    - `collectEffectUsage(effect: Effect): { write: Identifier; reads: Identifier[] }`
  - `@repo/checker`:
    - `check(project: Project): Issue[]` outputs node issues, edge issues, and variable-usage issues in `project.variables` order.
- **Decisions and why:**
  - `Issue.nodeId` made optional in favor of `variableId` with mutual exclusivity refinement (`(nodeId !== undefined) !== (variableId !== undefined)`). Variable-level issues do not attach to an arbitrary node.
  - Reachability limitation: variable usage is counted across all edges in `project.edges`, even edges whose source node is unreachable from any start node or dangling edges. Pinned with dedicated unit test.
  - Syntax error suppression: any parse error on any edge condition/effect suppresses all usage issues across the project to prevent cascading false positives. Pinned with unit test.
  - First declared variable wins: duplicate variable names attribute usage to the first declaration without crashing or attributing to duplicates.
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm exec turbo run typecheck lint test --force --continue` -> pass (8/8 tasks successful across 3 packages, 137 tests passing: 81 dsl, 56 checker).
- **Known issues / debt:** none
- **Next steps:**
  - Integrate AST evaluator or AST interpreter for playtest execution mode.

### W-006 | 2026-10-04 | Promote commit d9d7b35 as stable-002
- **Status:** DONE
- **Git:** uncommitted (user commits manually). Suggested message: `docs: record stable-002 promotion at commit d9d7b35`
- **Goal:** Promote commit `d9d7b35` as second stable baseline (`stable-002`) via `/promote-stable` workflow.
- **Files changed:**
  - `docs/context/last-stable-state.md`: updated to record stable-002 baseline (commit d9d7b35), gate result, capabilities, environment, and rollback instructions
  - `docs/context/recent-work.md`: added entry W-006 documenting the promotion
- **New/changed public APIs:** none
- **Decisions and why:**
  - Verified working tree clean and gate passing before user confirmation per `/promote-stable`.
  - Did not execute `git tag` per R6.1; provided tag command for user manual execution (`git tag stable-002 d9d7b35eef65a59abfdb4329f8dc5423177801e1`).
- **Assumptions / UNVERIFIED:** none
- **Verification:**
  - `pnpm check -- --force` -> pass (8/8 tasks successful across 3 packages, 109 tests passing)
- **Known issues / debt:** none
- **Next steps:**
  - User to tag commit with `git tag stable-002 d9d7b35eef65a59abfdb4329f8dc5423177801e1`.

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

## Older work (one line each; full detail in work-archive.md)
- W-002 | 2026-10-03 | Promote commit 5296eec as stable-001
- W-001 | 2026-10-03 | Monorepo bootstrap and pure packages skeleton
- W-000 | 2026-10-01 | Agent operating docs created
