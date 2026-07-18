# Chronicle

> **Version control for creative files — explained by AI.**
> Point Chronicle at your working folders; every save becomes a version, and AI writes the
> "commit message": *"background navy → teal; tagline removed."* Local-first: versions
> stay on your machine; AI inputs go only to the API provider you configure.

Built for the **AI Builders Challenge with IBM Bob** (BeMyApp · IBM SkillsBuild) —
July 2026 theme: *Reimagine Creative Industries with AI*.

---

## The Problem

Git solved version history for code because code is text and diffs are readable. Creative
files are binary — designers get no history, no diff, no "why". They fake it with filename
suffixes: `logo_final_v8_FINAL_approved.png`. Versions get lost, changes go unexplained,
and finding "that older version with the blue background" is manual archaeology.

## The Solution

Chronicle watches the folders you already work in (Photoshop, Figma exports, anything that
saves PNG/JPG) and:

1. **Captures every save automatically** — no commits, no uploads; a changed content hash
   becomes a new version (deduplicated, stored locally).
2. **Explains each change in plain English** — a vision model compares the previous and new
   version and writes a one-line summary, a change list, and searchable tags.
3. **Lets you search history by meaning** — hybrid keyword + embeddings search: *"the
   version with the tagline"* finds it, even if no filename ever said so.
4. **Restores any version without rewriting history** — like `git revert`, a restore is
   just a new version.

Capture, history, restore, and search run on-device with no account, backend, or Docker.
AI inference is API-based through LangChain: BYOK calls the configured provider directly,
while an optional gateway is stretch scope. The control plane adds accounts and usage
stats. Roadmap: PNG/JPG first (MVP), then the selected future formats **SVG, BLEND, OBJ,
STEP/STP, PSD, and PSB**. These cover vector design, layered image work, 3D creation, and
product-design interchange without expanding the MVP.

## AI Approach

- **LangChain (Python), model-agnostic, default classes/methods only** — the provider
  (Anthropic, IBM watsonx/Granite, OpenAI…) is swappable behind one interface, mirroring
  IBM Bob's own multi-model philosophy.
- AI features live in a **local Python AI service** (`services/ai/`: FastAPI + LangChain)
  that runs on the user's machine and is called by the Electron app over `127.0.0.1` —
  one AI codebase for the BYOK path and the optional backend gateway. It is not the
  control-plane backend.
- Vision-based change summaries + text embeddings for semantic search, both defined by a
  shared functional input/output contract. Versioned prompt assets live in
  `packages/prompts/` and may evolve independently for each researched implementation.
- AI is **always async** — the UI never blocks on a model call; jobs queue offline and run
  when connectivity returns.

## How We Use IBM Bob

IBM Bob is our primary development tool. Every PR logs how Bob was used in
[docs/bob-log.md](docs/bob-log.md) — that log feeds this section as the project progresses
(agentic workflows, Literate Coding sessions, BobShell recipes, Bobalytics evidence).

---

## Monorepo Layout

```
Chronicle/
│
├── apps/
│   ├── desktop/          Chronicle — Electron + React + TS (the product)
│   └── landing/          Astro static page (optional, stretch)
│
├── services/
│   ├── api/              FastAPI control plane ← pre-built (auth, RBAC, JWT)
│   └── module/           Challenge logic — AI gateway (stretch)
│
├── packages/
│   └── contracts/
│       ├── api/          OpenAPI spec + generated TypeScript types
│       └── module/       Python Protocol (backend ↔ module boundary)
│
├── infra/                OPA policies, Postgres init, Redis config
├── docs/                 Start at docs/index.md — team spec at docs/spec.md
├── docker-compose.yml
└── Makefile
```

## Stack at a Glance

| Layer | Technology |
|---|---|
| Desktop app (the product) | Electron 38 + electron-vite + React 19 + TypeScript + Tailwind CSS 4 |
| Local storage | SQLite (better-sqlite3) + content-addressed file library |
| File watching | chokidar (debounced, temp-file-aware) |
| AI layer | Local Python AI service — FastAPI + LangChain (BYOK), called by the Electron app on `127.0.0.1` · same code behind the gateway (stretch) |
| Control plane API (optional, lowest priority) | FastAPI + SQLAlchemy 2 (async), JWT + Redis whitelist, OPA RBAC |
| Database (backend) | PostgreSQL 16 + Alembic migrations |
| Orchestration (backend only) | Docker Compose |

Full detail and the reasoning behind each choice: [docs/spec.md](docs/spec.md).

---

## Quick Start

### Default: desktop app, no Docker

This is the MVP path and the one to use for normal Chronicle development. It does not
require Docker, a backend, or an account.

**Requires:** Node.js 20+ and GNU make. On Windows, run make from Git Bash or WSL.

```bash
make setup      # install desktop dependencies
make run        # open Electron with hot reload
make build      # build the desktop app
make package    # create a Windows installer .exe in apps/desktop/dist/
```

Useful check:

```bash
make typecheck  # TypeScript check for the desktop app
```

If `make run` reports `Error: Electron uninstall`, repair the downloaded Electron
binary and run again:

```bash
make ensure-electron
make run
```

No make available? Use the underlying npm commands:

```bash
npm --prefix apps/desktop ci
npm --prefix apps/desktop run ensure-electron
npm --prefix apps/desktop run dev
npm --prefix apps/desktop run build
npm --prefix apps/desktop run package
```

### Optional: Docker backend control plane

Only use this when you are working on login, telemetry, admin stats, generated API
types, or the stretch AI gateway. It is not needed to run or demo Chronicle locally.

**Requires:** Docker Desktop.

```bash
make setup-backend   # create .env if missing, start services, run migrations
make backend         # run Postgres, Redis, OPA, and FastAPI in the foreground
make stop            # stop backend services
```

Swagger UI is available at `http://localhost:8000/docs`. Smoke test:

```bash
curl http://localhost:8000/api/v1/hello
# {"message":"Hello, world!"}
```

All-in commands exist for people touching every surface:

```bash
make setup-all   # desktop + landing + backend + migrations
make run-all     # backend in the background, then desktop
make build-all   # desktop + landing + backend image build
```

---

## Documentation

Start at [docs/index.md](docs/index.md).

| Read | For |
|---|---|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | **New team members** — plain-language overview, diagrams, glossary, contracts, and branch workflow |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | **Current position** — readiness, blockers, decisions, milestones, and next actions |
| [TODO.md](TODO.md) | **Claim work** — scoped MVP tasks, file boundaries, dependencies, and acceptance checks |
| [docs/spec.md](docs/spec.md) | **Technical source of truth** — stack, ways of working, and MVP feature scope |
| [docs/challenge/](docs/challenge/CHALLENGE.md) | Challenge rules, vision, constraints, research |
| [docs/bob-log.md](docs/bob-log.md) | IBM Bob usage log (judged artifact) |
| [docs/getting-started.md](docs/getting-started.md) | Setup and repo orientation for humans |
| [docs/contracts.md](docs/contracts.md) | The contract system that lets teams work in parallel |
| [docs/backend/](docs/backend/overview.md) | API reference, auth, RBAC, database |

## Status

Planning, documentation, and boundary contracts are ready; MVP implementation is next.
See the live [project status](PROJECT_STATUS.md). Submission is due
**July 31, 2026, 11:59 PM ET**.
Milestones: contracts (Jul 18) → MVP feature-complete (Jul 27) → video + README +
SkillsBuild (Jul 30) → submit (Jul 31). Scope labels in [docs/spec.md](docs/spec.md) §4
are binding: `MVP` first, `Stretch` only after everything works.
