# Onboarding - Day 0 Setup

> See also: [System Overview](architecture/overview.md) · [Backend Overview](backend/overview.md) · [Module Contracts](contracts.md) · [MCP Servers](mcp-servers.md)

Chronicle's default setup is the desktop app only. You do **not** need Docker, the
backend, or an account to run the product, capture files, browse cached history,
restore versions, or do keyword search. Docker is only for the optional backend
control plane: login, telemetry, admin stats, generated API types, and the stretch AI
gateway.

---

## Prerequisites

| Tool | Required for | Notes |
|---|---|---|
| Git | everything | Clone the repo and work with branches |
| Node.js 20+ | desktop app | Used by Electron, React, and type generation |
| GNU make | simple commands | On Windows, run from Git Bash or WSL, not PowerShell/CMD |
| Docker Desktop 4.x | optional backend only | Postgres, Redis, OPA, and FastAPI |
| Python 3.12 | optional local backend tests | `make test` runs tests in Docker instead |

---

## 1 - Clone

```bash
git clone <repo-url>
cd Chronicle
```

If your local folder has a different name, use that folder instead of `Chronicle`.

---

## 2 - Run Chronicle Without Docker

```bash
make setup
make run
```

What this does:

- `make setup` installs `apps/desktop` dependencies from its lockfile.
- `make run` opens the Electron app with hot reload.
- No `.env`, Docker services, backend account, or database server is required.

No make available? Run the underlying npm commands:

```bash
npm --prefix apps/desktop ci
npm --prefix apps/desktop run ensure-electron
npm --prefix apps/desktop run dev
```

---

## 3 - Build and Check the Desktop App

```bash
make typecheck
make build
make package
```

These are also Docker-free. `make build` creates the desktop production bundle in
`apps/desktop/out/`. `make package` creates a Windows installer `.exe` in
`apps/desktop/dist/`.

---

## 4 - Optional Docker Backend Control Plane

Use this only when you are working on backend features: auth/account linking,
telemetry, admin stats, generated OpenAPI types, or the stretch hosted AI gateway.

```bash
make setup-env
# Optional: edit .env to set JWT_SECRET_KEY and local admin credentials.
make control-plane-up
```

`make control-plane-up` starts Postgres, Redis, OPA, and the FastAPI service, then runs
Alembic migrations and seed data.

Verify the backend:

```bash
make control-plane-health
# {"status":"ok","service":"chronicle-control-plane","version":"0.2.0"}
```

Swagger UI is at `http://localhost:8000/docs`.

For daily backend work:

```bash
make backend                 # run backend services in the foreground
make control-plane-down      # stop backend services
```

---

## All-In Commands

For teammates touching every surface:

```bash
make setup-all   # desktop + landing + backend + migrations
make run-all     # backend in the background, then desktop
make build-all   # desktop + landing + backend image build
```

Most contributors should start with `make setup` and `make run` instead.

---

## Common Commands

```bash
make setup                         # desktop dependencies only; no Docker
make ensure-electron               # repair missing Electron binary
make run                           # desktop app
make build                         # desktop build
make package                       # Windows installer .exe
make typecheck                     # desktop TypeScript check
make test-desktop                  # desktop tests
make control-plane-up              # optional Docker backend + migrations
make control-plane-health          # verify API reachability and identity
make control-plane-down            # stop optional Docker backend
make backend                       # optional Docker backend foreground run
make migrate                       # apply backend migrations
make makemigration MSG="add table" # create a backend migration
make generate-types                # OpenAPI -> TypeScript types
make test                          # backend pytest in Docker
make test-local                    # backend pytest in local Python env
make lint                          # backend Ruff checks
make check                         # desktop typecheck/tests + backend tests/lint
```

---

## Optional Backend URLs

These exist only when the Docker backend is running.

| URL | What |
|---|---|
| `http://localhost:8000/docs` | Swagger UI |
| `http://localhost:8000/health` | Public API reachability + identity/version preflight |

Compose project name is `chronicle`; service names are `api`, `postgres`, `redis`, and `opa`.
Only `api` publishes a host port. Use `docker compose exec <service> ...` for internal dependencies.

---

## Next Steps by Role

| You are... | Start here |
|---|---|
| **Desktop app** | `apps/desktop/` and [desktop/overview.md](desktop/overview.md) |
| **Backend control plane** | [Backend Overview](backend/overview.md) |
| **Challenge module / gateway** | [Module Contracts](contracts.md) |
| **Infra / DevOps** | `docker-compose.yml`, `infra/`, `Makefile` |
