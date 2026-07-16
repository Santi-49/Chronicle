# Hackathon Template

> A production-grade monorepo starter for hackathons.  
> Bring your challenge-specific logic — not the scaffolding.

---

## What's This?

Every hackathon wastes the first hours on the same boilerplate: auth, roles, a database, a running API, a frontend that can talk to it. This template eliminates that.

It ships with a fully working single-tenant backend (register, login, RBAC, JWT revocation) and a clean boundary — the **module contract** — where your challenge-specific logic plugs in. The rest of the team can build frontend and infra from minute one without waiting.

---

## Stack at a Glance

| Layer | Technology |
|---|---|
| Landing page | Astro → Cloudflare Pages |
| Web app | Vite + React + TypeScript |
| Mobile app | Expo (React Native) |
| REST API | FastAPI + SQLAlchemy 2 (async) |
| Auth | JWT (python-jose) + Redis whitelist |
| Authorization | Open Policy Agent (RBAC) |
| Database | PostgreSQL 16 + Alembic migrations |
| Orchestration | Docker Compose |

---

## Monorepo Layout

```
hackathon-template/
│
├── apps/
│   ├── landing/          Cloudflare Pages static site (Astro)
│   ├── web/              Main SPA (Vite + React)
│   └── mobile/           Mobile app (Expo)
│
├── services/
│   ├── api/              REST backend (FastAPI) ← fully implemented
│   └── module/           Challenge-specific logic (plug in here)
│
├── packages/
│   └── contracts/
│       ├── api/          OpenAPI spec + generated TypeScript types
│       └── module/       Python Protocol for backend ↔ module boundary
│
├── infra/
│   ├── opa/policies/     Rego authorization policies
│   ├── postgres/         DB init SQL
│   └── redis/            Redis config
│
├── docs/                 Full documentation (start at docs/index.md)
├── docker-compose.yml
├── docker-compose.override.yml   Dev: hot reload + exposed ports
├── .env.example
└── Makefile
```

---

## Quick Start

**Requires:** Docker Desktop, Git

```bash
# 1. Clone and configure
git clone <repo-url> && cd hackathon-template
cp .env.example .env          # set JWT_SECRET_KEY and admin credentials

# 2. Start all services
docker compose up --build

# 3. Run migrations + seed data
make migrate

# 4. Verify
curl http://localhost:8000/api/v1/hello
# → {"message":"Hello, world!"}
```

Open `http://localhost:8000/docs` for the interactive Swagger UI.

> First-time build takes ~2 min. Subsequent starts are fast.

---

## What the Backend Gives You Out of the Box

| Feature | Endpoint(s) |
|---|---|
| Register | `POST /api/v1/auth/register` |
| Login (JWT) | `POST /api/v1/auth/login` |
| Logout (token revocation) | `POST /api/v1/auth/logout` |
| Token refresh | `POST /api/v1/auth/refresh` |
| Current user | `GET /api/v1/auth/me` |
| User CRUD + role assignment | `GET/PATCH/DELETE /api/v1/users/{id}` |
| Role CRUD + permission assignment | `GET/POST/PATCH/DELETE /api/v1/roles/{id}` |
| Permission CRUD | `GET/POST/DELETE /api/v1/permissions/{id}` |
| Protected demo endpoint | `GET /api/v1/hello/protected` |

All protected routes check **OPA** for authorization. Adding a new resource takes one Rego entry and one route — no auth code changes needed.

---

## Plugging In Your Challenge Logic

1. Read [Module Contracts](docs/contracts.md)
2. Fill in `packages/contracts/module/interface.py` with your Protocol
3. Implement it in `services/module/app/implementation.py`
4. Call it from `services/api/app/services/`

The backend and module teams can work in parallel from the moment the interface is defined.

---

## Common Commands

```bash
make dev                # docker compose up --build
make stop               # docker compose down
make migrate            # alembic upgrade head (+ seed data on first run)
make makemigration MSG="add payments table"   # generate a new Alembic migration
make test               # pytest (SQLite + mocked Redis/OPA, no Docker needed)
make generate-types     # export OpenAPI → TypeScript types for the frontend
```

---

## Documentation

Full docs live in [`docs/`](docs/index.md).

| Section | What's covered |
|---|---|
| [System Overview](docs/architecture/overview.md) | Service map, request flow, contract boundaries |
| [Backend Overview](docs/backend/overview.md) | Stack, folder structure, how to run |
| [Authentication](docs/backend/auth.md) | JWT flow, Redis whitelist, token lifecycle |
| [RBAC](docs/backend/rbac.md) | OPA policies, roles, permissions, how to extend |
| [API Reference](docs/backend/api-reference.md) | Every endpoint with request/response examples |
| [Database](docs/backend/database.md) | Schema, models, Alembic migrations |
| [Module Contracts](docs/contracts.md) | How to wire in challenge-specific logic |
| [Onboarding](docs/onboarding.md) | Day-0 setup guide |
