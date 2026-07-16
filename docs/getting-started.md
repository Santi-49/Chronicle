# Getting Started

> For humans. Read this first, then go build.

---

## What you're working with

This repo eliminates the usual hackathon dead-time. Auth, roles, a database, a running API — all done. Your job is to plug in the challenge-specific logic and build the frontend on top of it.

There are two apps and one backend:

```
apps/desktop/     Chronicle desktop app (Electron + React) — the product
apps/landing/     Static landing page (Astro) — optional
services/api/     REST API (FastAPI) — already implemented, used as control plane
services/module/  Your challenge logic lives here
```

The backend and the frontend never talk to each other's internals. They communicate through **contracts** — more on that in a moment.

---

## Step 0 — Fill in the challenge context

> This is the one thing an AI cannot do for you. Do it before writing any code.

The `docs/challenge/` folder has four files. For this project they are **already filled in** for the AI Builders Challenge (Chronicle) — keep them updated as things change:

| File | What goes in it |
|---|---|
| `CHALLENGE.md` | Problem statement, judging criteria, provided data/APIs, hard rules |
| `VISION.md` | Your solution concept, key features, demo script |
| `CONSTRAINTS.md` | Which apps you're building, team ownership, timeline, design direction |
| `RESEARCH.md` | What you found out about the organizer, the problem space, what to emphasize |

**Why this matters:** every team using AI will have a basic solution. What makes your solution different lives entirely in these files. Claude reads them at the start of every session — if they're empty, it doesn't know what problem you're solving.

They were filled in at kickoff (2026-07-16) — update them as you learn more, especially `RESEARCH.md` before major design decisions.

---

## First-time setup

**You need:** Docker Desktop, Git, Node.js 20+

```bash
# 1. Clone
git clone <repo-url> && cd AI-Builders-Bob

# 2. Configure
cp .env.example .env
# Open .env and set JWT_SECRET_KEY (any string ≥32 chars)
# Set FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD

# 3. Start everything
docker compose up --build
# First build: ~2 min. After that, fast.

# 4. Run migrations
make migrate
# Creates tables, seeds roles, creates your admin user

# 5. Verify it works
curl http://localhost:8000/api/v1/hello
# → {"message":"Hello, world!"}
```

Open `http://localhost:8000/docs` to browse the API interactively.

### What's running

| URL | What |
|---|---|
| `http://localhost:8000/docs` | Swagger UI — try every endpoint here |
| `http://localhost:8000` | API |
| `http://localhost:5432` | Postgres |
| `http://localhost:6379` | Redis |
| `http://localhost:8181` | OPA (authorization engine) |

---

## AI tooling — MCP servers and Skills

This template is set up to work with Claude Code. Two things power that integration: **MCP servers** and **Skills**.

### MCP servers

MCP servers give Claude direct access to tools — query the database, drive a browser, inspect containers — without copy-pasting output. The project ships with five pre-configured servers in `.mcp.json`:

| Server | What it does |
|---|---|
| `postgres` | Query the DB, inspect schema, verify migrations |
| `playwright` | Control a real browser — test frontends, take screenshots |
| `docker` | Stream container logs, exec into running services |
| `fetch` | Fetch any URL and get the content as Markdown |
| `markitdown` | Convert PDFs, DOCX, and HTML files to Markdown |

**Verify they're working** by opening Claude Code in this project and running `/mcp`. You should see all five servers listed as connected. If any are missing, check that `uv` and Node.js are installed — those are the two runtimes the servers need.

Full setup instructions (for other agents, VS Code Copilot, etc.) are in [docs/mcp-servers.md](mcp-servers.md).

### Skills

Skills are curated knowledge packs for specific domains. They live in `.skills/` and Claude loads them when they're relevant — you don't need to manage them manually.

This project has skills for:

| Domain | When it's used |
|---|---|
| `design/ui-ux-pro-max` | Any visual design decision — color, typography, component patterns |
| `animation/gsap-*` | GSAP animations in the landing page or the desktop app's renderer |

You don't invoke them manually for the most part. The main exception is when you want to steer a design decision — you can ask Claude to search the design database explicitly:

```bash
python .skills/design/ui-ux-pro-max/scripts/search.py "fintech dashboard dark mode" --design-system
```

---

## The API already does this

You don't need to build any of it:

- Register / login / logout / token refresh
- JWT auth with Redis token revocation (so logout actually works)
- Role-based access control via OPA — add a new resource in one Rego line
- User management, role/permission CRUD

Everything protected. Everything tested. Start from there.

---

## The contracts system

This is the core idea of the template. Here's why it exists and how it works.

### The problem it solves

At a hackathon, the team splits up: some people work on infrastructure and API wiring, others work on the actual challenge logic. Without a clear boundary, you end up with two bad outcomes:

- **Everyone blocks on each other.** The frontend can't start until the API is ready. The API can't start until the module is ready.
- **Everything gets tangled.** Challenge logic seeps into API routes. API assumptions leak into the module. Two weeks later (or two hours later) it's a mess.

### The solution: agree on the interface, then work in parallel

A **contract** is a Python file that says: *"this is what the backend expects the module to provide."* No implementation — just method names, inputs, and outputs. Once that file exists, both sides can work independently.

### A concrete example

Let's say the hackathon challenge is: **given a recipe ingredient list, suggest wine pairings.**

**Step 1 — Define the contract** (`packages/contracts/module/interface.py`)

```python
from typing import Protocol
from dataclasses import dataclass

@dataclass
class PairingInput:
    user_id: str
    ingredients: list[str]

@dataclass
class PairingOutput:
    wines: list[str]
    explanation: str

class ModuleContract(Protocol):
    async def suggest_pairing(self, input: PairingInput) -> PairingOutput: ...
    async def health(self) -> bool: ...
```

This file is written in the first 30 minutes, agreed on by the whole team, and then everyone goes their separate way.

**Step 2 — Module team implements the logic** (`services/module/app/implementation.py`)

```python
from packages.contracts.module.interface import ModuleContract, PairingInput, PairingOutput

class WinePairingModule:
    async def suggest_pairing(self, input: PairingInput) -> PairingOutput:
        # Call an LLM, run a model, query a database — whatever the challenge needs
        wines = await call_llm(input.ingredients)
        return PairingOutput(wines=wines, explanation="Because garlic.")

    async def health(self) -> bool:
        return True
```

The module team can test this in total isolation. They don't need the API to exist.

**Step 3 — API team wires it up** (`services/api/app/services/pairing_service.py`)

```python
from packages.contracts.module.interface import ModuleContract, PairingInput

async def get_pairing(module: ModuleContract, user_id: str, ingredients: list[str]):
    return await module.suggest_pairing(PairingInput(user_id=user_id, ingredients=ingredients))
```

The API team codes against the Protocol type — they don't care how the module works, just that it satisfies the interface. Python checks this at runtime automatically (no inheritance needed).

**The result:** both teams ship features without stepping on each other.

### The frontend contract works the same way

The API auto-generates a TypeScript types file from its schemas. Run this whenever the backend adds or changes an endpoint:

```bash
make generate-types
# writes packages/contracts/api/generated/index.ts
```

Import from there in your frontend code — never write API types by hand. When the backend changes a schema, TypeScript will tell you immediately at compile time.

---

## Adding a new feature (the full loop)

When you need a new resource (say, a `/pairings` endpoint):

1. **Backend** — add a Pydantic schema in `services/api/app/schemas/`
2. **Backend** — add a service in `services/api/app/services/`
3. **Backend** — add a route in `services/api/app/api/v1/endpoints/`
4. **Backend** — add one line to `infra/opa/policies/roles.rego` for authorization
5. **Backend** — run `make makemigration MSG="add pairings table"` if you need a new table
6. **Everyone** — run `make generate-types` so the frontend gets updated types
7. **Desktop app** — import the new types and build

---

## Day-to-day commands

```bash
make dev                             # start all services
make stop                            # shut everything down
make migrate                         # apply migrations
make makemigration MSG="..."         # create a new migration
make generate-types                  # sync TypeScript types from the API
make test                            # run the test suite
```

---

## Where to go next

| You're working on | Read |
|---|---|
| The team spec (stack, rules, MVP scope) | [spec.md](spec.md) — **read before building anything** |
| Backend routes and auth | [backend/overview.md](backend/overview.md) |
| Challenge module logic | [contracts.md](contracts.md) |
| Desktop app | `apps/desktop/` — run `npm install && npm run dev` |
| Authorization / roles | [backend/rbac.md](backend/rbac.md) |
| Database / migrations | [backend/database.md](backend/database.md) |
| System architecture | [architecture/overview.md](architecture/overview.md) |
