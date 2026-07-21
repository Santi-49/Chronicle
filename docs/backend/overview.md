# Backend Overview

> See also: [Authentication](auth.md) · [RBAC](rbac.md) · [API Reference](api-reference.md) · [Database](database.md)  
> Parent: [System Overview](../architecture/overview.md)

---

## Stack

| Layer | Library | Version |
|---|---|---|
| Framework | FastAPI | ^0.115 |
| ORM | SQLAlchemy (async) | ^2.0 |
| DB driver | asyncpg | ^0.29 |
| Migrations | Alembic | ^1.13 |
| Validation | Pydantic v2 | ^2.7 |
| Config | pydantic-settings | ^2.3 |
| JWT | python-jose | ^3.3 |
| Google ID-token verification | google-auth | ^2.40 |
| Passwords | passlib[bcrypt] | ^1.7 |
| Token store | redis (async) | ^5.0 |
| OPA client | httpx | ^0.27 |
| Server | uvicorn | ^0.30 |
| Tests | pytest-asyncio + httpx | latest |

---

## Folder Structure

```
services/api/
│
├── app/
│   ├── main.py                   # Chronicle API metadata, /health, CORS, lifespan
│   │
│   ├── api/v1/
│   │   ├── router.py             # Aggregates all endpoint routers
│   │   └── endpoints/
│   │       ├── auth.py           # password + Google auth, link, logout, refresh, /me
│   │       ├── account.py        # revisioned settings + opaque encrypted secrets
│   │       ├── installations.py  # random installation registration + account link
│   │       ├── users.py          # CRUD + role assignment
│   │       ├── roles.py          # CRUD + permission assignment
│   │       ├── permissions.py    # CRUD
│   │       └── hello.py          # Public + protected demo
│   │
│   ├── core/
│   │   ├── config.py             # Settings (pydantic-settings, reads .env)
│   │   ├── database.py           # Async engine + get_db dependency
│   │   ├── redis.py              # Redis client + token whitelist helpers
│   │   ├── security.py           # JWT create/decode, bcrypt hash/verify
│   │   ├── opa.py                # OPA HTTP client
│   │   └── dependencies.py       # get_current_user, require_permission
│   │
│   ├── models/                   # SQLAlchemy ORM, including control_plane.py
│   ├── schemas/                  # Strict Pydantic schemas, including control_plane.py
│   └── services/                 # Auth/Google/control-plane + existing business logic
│
├── alembic/                      # Migrations
├── tests/                        # pytest (SQLite in-memory + mocked Redis/OPA)
├── Dockerfile                    # Multi-stage: base / development / production
├── pyproject.toml
└── alembic.ini
```

---

## Running Locally

### With Docker (recommended)

```bash
make setup-env                # create .env if missing; then fill in secrets
make control-plane-up         # starts postgres, redis, opa, api; applies migrations
make control-plane-health     # expects Chronicle control-plane identity/version JSON
```

API is available at `http://localhost:8000`.  
Interactive docs at `http://localhost:8000/docs`.
Docker Compose uses project name `chronicle`; service names are exactly `api`, `postgres`,
`redis`, and `opa`.

### Without Docker (tests only)

```bash
cd services/api
pip install -e ".[dev]"
pytest
```

Tests use SQLite in-memory and mock Redis/OPA — no external services needed.

---

## Key Design Principles

**Thin endpoints, fat services.** Route handlers in `endpoints/` only parse the request and call a function in `services/`. All business logic lives in services.

**Dependency injection for everything external.** The DB session, Redis client, and current user are all provided via `Depends(...)`. This makes unit testing straightforward — override any dependency in `conftest.py`.

**JWT whitelist, not blacklist.** Tokens are valid only while a matching key exists in Redis. This means logout is instant and reliable. See [Authentication](auth.md) for the full flow.

**OPA owns authorization.** The backend never makes `if user.role == "admin"` checks. All permission decisions go through OPA. See [RBAC](rbac.md).

---

## Environment Variables

All variables are documented in `.env.example` at the repo root. Key ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Async PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `OPA_URL` | OPA server base URL |
| `JWT_SECRET_KEY` | HMAC signing key (≥ 32 chars in production) |
| `FIRST_ADMIN_EMAIL` | Seeded on first `make migrate` |
| `FIRST_ADMIN_PASSWORD` | Seeded on first `make migrate` |
| `GOOGLE_OAUTH_CLIENT_ID` | Desktop OAuth client ID; API validates the Google ID-token audience |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Unused by Chronicle's desktop PKCE flow; never bundle it in Electron |
