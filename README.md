# Narrative Design Platform

A web-based narrative design tool for game writers featuring branching flow graphs, lore/relationship graphs, automated consistency checking, and real-time collaboration.

## Getting Started

### Prerequisites

- Node.js 24 (`.nvmrc` provided)
- pnpm 12.8.1

### Installation

```bash
pnpm install
```

### Verification Gate

Run type-checking, linting, and tests across all packages:

```bash
pnpm check
```

Other available commands:

- `pnpm typecheck` - Run TypeScript compiler checks
- `pnpm lint` - Run ESLint checks
- `pnpm test` - Run Vitest test suites

## Repository Layout

```text
packages/
  schema/       Zod schemas and inferred types for Project, FlowNode, FlowEdge
  checker/      Pure static graph analysis (findUnreachableNodes)
docs/
  RULES.md          Operating rules and constraints
  ARCHITECTURE.md   System architecture and decisions
  context/          Rolling work log and stable state records
```
