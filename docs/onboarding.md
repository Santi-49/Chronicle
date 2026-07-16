# Onboarding — Day 0 Setup

> See also: [System Overview](architecture/overview.md) · [Backend Overview](backend/overview.md) · [Module Contracts](contracts.md) · [MCP Servers](mcp-servers.md)

Get the full stack running locally in under 10 minutes.

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Docker Desktop | 4.x | Includes Docker Compose v2 |
| Node.js | 20 LTS | Required for `make generate-types` |
| Python | 3.12 | Required for local tests only (`make test` runs inside Docker) |
| Git | any | |
| GNU make | any | **macOS/Linux:** pre-installed. **Windows:** run from **Git Bash** (bundled with Git for Windows) or WSL — do _not_ use PowerShell or CMD |

---

## 1 — Clone & configure

```bash
git clone <repo-url>
cd AI-Builders-Bob
cp .env.example .env
```

Open `.env` and set:
- `JWT_SECRET_KEY` — any string ≥ 32 characters
- `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` — your local admin credentials
- Leave everything else as-is for local development

---

## 2 — Start Docker services

```bash
docker compose up --build
```

This starts Postgres, Redis, OPA, and the API. The first build takes ~2 minutes; subsequent starts are fast.

---

## 3 — Run migrations & seed data

```bash
make migrate
```

This runs `alembic upgrade head`, which:
- Creates all five database tables
- Seeds the `admin` and `user` roles
- Seeds the full permissions matrix
- Creates the first admin user from your `.env` values

---

## 4 — Verify

```bash
curl http://localhost:8000/api/v1/hello
# → {"message":"Hello, world!"}

curl http://localhost:8000/docs
# → Open in browser for Swagger UI
```

Log in with your admin credentials:
```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme"}' | python -m json.tool
```

---

## 5 — Run tests (no Docker needed)

```bash
cd services/api
pip install -e ".[dev]"
pytest
```

Tests use SQLite in-memory and mock both Redis and OPA. All 32 tests should pass.

---

## What's Running

| URL | What |
|---|---|
| `http://localhost:8000/docs` | Swagger UI (interactive API docs) |
| `http://localhost:8000/api/v1/hello` | Public smoke test |
| `http://localhost:5432` | Postgres (user: hackathon, db: hackathon) |
| `http://localhost:6379` | Redis |
| `http://localhost:8181` | OPA policy engine |

---

## Common Commands

```bash
make dev              # docker compose up --build
make stop             # docker compose down
make migrate          # alembic upgrade head
make makemigration MSG="add payments table"   # create a new migration
make test             # pytest in Docker
make generate-types   # regenerate TypeScript types from OpenAPI spec
```

---

## Next Steps by Role

| You are... | Start here |
|---|---|
| **Backend** | [Backend Overview](backend/overview.md) → pick up a route in `services/api/app/api/v1/endpoints/` |
| **Desktop app** | `apps/desktop/` — run `npm install && npm run dev`, import types from `packages/contracts/api/generated/` |
| **Challenge module** | [Module Contracts](contracts.md) — implement `services/module/app/implementation.py` |
| **Infra / DevOps** | `docker-compose.yml`, `infra/`, `Makefile` |
