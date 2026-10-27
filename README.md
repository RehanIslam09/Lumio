# ✨ Lumio — Narrative Design Platform for Game Writers

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.3-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-4.13-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build/)
[![Vitest](https://img.shields.io/badge/Tests-800+_Passing-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![Render](https://img.shields.io/badge/Deployed-Render-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://render.com/)

**The next-generation narrative IDE for interactive storytelling, branching dialogue, and game writing.**

[🚀 **Explore the Live App**](https://lumio-web-w6o9.onrender.com) • [⚡ **Backend API Status**](https://lumio-api-lonx.onrender.com/health) • [📖 **Architecture Docs**](docs/ARCHITECTURE.md)

</div>

---

## 🌟 Overview

Writing non-linear, choice-driven video game narratives is notoriously complex. Traditional tools like Google Docs, Notion, or spreadsheets break down when dealing with hundreds of branching paths, variable states, and interconnected lore.

**Lumio** is a purpose-built, web-based narrative design platform created for game writers, narrative designers, and quest builders. It pairs a fluid node-based **flow graph** with an automated **static consistency checker**, interactive **playtest simulation engine**, and cloud-backed **version control**.

---

## 🚀 Live Deployment

The platform is deployed and hosted on Render:

| Service | Type | Live URL |
|---|---|---|
| **Frontend Web App** | Render Static Site (React 19 + Vite) | [https://lumio-web-w6o9.onrender.com](https://lumio-web-w6o9.onrender.com) |
| **Backend API** | Render Web Service (Node.js + Hono) | [https://lumio-api-lonx.onrender.com](https://lumio-api-lonx.onrender.com) |
| **Database** | Managed PostgreSQL | Internal cluster connection |

---

## 💎 Core Highlights & Features

### 1. 🌲 Visual Branching Flow Graph
- **Node-Based Canvas**: Powered by `@xyflow/react` and React 19 with GPU-accelerated panning, smooth zooming, and custom connection routing.
- **Narrative Node Types**:
  - **Dialogue Nodes**: Speaker assignment, rich dialogue scripts, and interactive choices.
  - **Story Beats**: High-level narrative milestones and plot progression.
  - **Condition Gates**: Branch outcomes based on story state, player inventory, or narrative flags.
  - **Endings**: Categorized endings (victory, tragedy, secret, resolution).
- **Writer-Centric Productivity**: Keyboard shortcuts, instant search, multi-selection, and automatic layout alignment.

### 2. 🛡️ Real-Time Automated Consistency Checker
- **Zero-Latency Static Analysis**: Runs continuously in the background using `@repo/checker` as you create and edit nodes.
- **Defect Detection**:
  - **Unreachable Nodes**: Identifies orphaned scenes that cannot be reached from the root story node.
  - **Inescapable Dead Ends**: Highlights dialogue branches that lead nowhere without being marked as an ending.
  - **Dangling Choices**: Surfaces choice options lacking outgoing connections.
  - **Character Voice Parity**: Cross-checks dialogue speakers against your entity lore database to detect undefined or silent characters.

### 3. 🎲 Monte Carlo Playtest & Simulation Engine
- **Automated Reader Simulation**: Run batch Monte Carlo playthroughs (e.g., 100 to 1,000 simulated readers) through your graph in milliseconds.
- **Coverage & Bottleneck Analytics**:
  - Discover choke points where playthroughs get bottlenecked.
  - Measure percentage distribution across all possible story endings.
  - Catch infinite loop traps before a single line of game code is written.
- **Interactive Reader Mode**: Test-drive your story choice-by-choice in a clean, distraction-free playback overlay.

### 4. 📜 Integrated Lore & Entity Graph
- Maintain world-building assets directly alongside your story scripts: characters, factions, locations, and historical lore.
- Deeply bind entity relationships to dialogue conditions and player choices.

### 5. ☁️ Enterprise Cloud Persistence & Versioning
- **Point-in-Time Revision History**: Create, browse, restore, and compare snapshots of your story graph over time.
- **Optimistic Concurrency**: Prevents accidental overwrites when collaborating across multiple tabs or sessions.
- **Hardened Security**:
  - Argon2id password hashing with timing-attack parity.
  - Cryptographically secure session tokens stored in `httpOnly`, `SameSite=None`, `Secure` cookies.
  - Comprehensive sliding-window rate limiting and CSRF origin validation.

---

## 🛠️ Architecture & Tech Stack

Lumio is architected as a modular, decoupled TypeScript monorepo managed with **pnpm** and **Turborepo**:

```
narrative-design-platform/
├── apps/
│   ├── web/         # React 19, Vite, @xyflow/react, Vanilla CSS design tokens
│   └── server/      # Node.js, Hono, Drizzle ORM, node-postgres, Argon2id
├── packages/
│   ├── schema/      # Pure Zod schemas & shared contracts (Project, Nodes, Edges)
│   ├── checker/     # Pure static graph analysis engine (zero external dependencies)
│   └── dsl/         # Narrative condition & effect expression evaluation engine
└── docs/            # Architecture specifications, decision records, and workflows
```

### Technology Breakdown

| Layer | Technologies | Key Responsibilities |
|---|---|---|
| **Frontend** | React 19, Vite 8, `@xyflow/react` 12 | Visual graph canvas, playtest simulation, state management |
| **Backend** | Hono 4, Node 24, `@hono/node-server` | Lightweight, ultra-fast REST API, auth & session orchestration |
| **Database & ORM** | PostgreSQL 16+, Drizzle ORM | Relational schema, automated migrations, version snapshots |
| **Security** | `@node-rs/argon2`, httpOnly Cookies | Password security, session management, CSRF protection |
| **Testing** | Vitest 5, `fast-check` 4 | Unit testing, property-based generative testing, DB integration |
| **Monorepo** | Turborepo 2, pnpm 12 | Incremental caching, build pipeline orchestration |

---

## 🧪 Testing & Quality Standards

Lumio maintains an exhaustive automated test suite exceeding **800+ tests** across 68 test suites:

- **Property-Based Invariant Testing (`fast-check`)**: Rigorously tests arbitrary graph structures, ensuring graph operations (add, move, split, delete, undo, redo) preserve structural integrity across thousands of randomized executions.
- **Scale & Stress Benchmarking**: Automated benchmarks verifying performance against 3,000-node and 5,000-edge narrative graphs.
- **Database Integration Tests**: Concurrent racing, rollback guarantees, foreign key cascades, and duplicate conflict handling tested against real PostgreSQL instances.

To run the verification gate:
```bash
pnpm check
```
*(Runs full TypeScript compilation, ESLint validation, and all Vitest test suites across the monorepo)*

---

## 💻 Getting Started Locally

### Prerequisites
- **Node.js**: v24.x (see `.nvmrc`)
- **pnpm**: v12.x or later (`npm install -g pnpm`)
- **PostgreSQL**: Native PostgreSQL instance running on port `5432`

### 1. Clone the Repository
```bash
git clone https://github.com/RehanIslam09/Lumio.git
cd Lumio
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables

**Backend (`apps/server/.env`):**
```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://lumio:your_password@localhost:5432/lumio
TEST_DATABASE_URL=postgresql://lumio:your_password@localhost:5432/lumio_test
CORS_ORIGINS=http://localhost:5173
```

**Frontend (`apps/web/.env`):**
```env
VITE_API_BASE_URL=http://localhost:3001
```

### 4. Run Database Migrations
```bash
pnpm --filter @repo/server db:migrate
```

### 5. Launch the Development Servers
In separate terminals:
```bash
# Terminal 1: Launch Backend API (port 3001)
pnpm dev:server

# Terminal 2: Launch Frontend App (port 5173)
pnpm dev
```

Open **`http://localhost:5173`** in your browser to start writing!

---

## 📦 Production Deployment

Lumio is designed for zero-friction cloud deployment on modern PaaS platforms like Render:

### Web Service (API)
- **Environment**: Node
- **Build Command**: `pnpm install && pnpm --filter @repo/server db:migrate`
- **Start Command**: `pnpm --filter @repo/server start`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `DATABASE_URL`: Your PostgreSQL connection string
  - `CORS_ORIGINS`: Your frontend URL (e.g., `https://lumio-web.onrender.com`)

### Static Site (Frontend)
- **Build Command**: `pnpm install && pnpm --filter @repo/web build`
- **Publish Directory**: `apps/web/dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL`: Your live backend API URL
- **Rewrite Rule**: `/*` ➔ `/index.html` (SPA routing)

---

## 📄 License & Integrity

This project is created for game writers and developers who believe interactive storytelling deserves modern, reliable, and beautiful engineering.
