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
│   ├── main.py                   # App factory, CORS, lifespan hooks
│   │
│   ├── api/v1/
│   │   ├── router.py             # Aggregates all endpoint routers
│   │   └── endpoints/
│   │       ├── auth.py           # register, login, logout, refresh, /me
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
│   ├── models/                   # SQLAlchemy ORM models
│   ├── schemas/                  # Pydantic request/response schemas
│   └── services/                 # Business logic (called by endpoints)
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
cp .env.example .env          # fill in secrets
docker compose up --build     # starts postgres, redis, opa, api
make migrate                  # runs alembic upgrade head (seeds data too)
```

API is available at `http://localhost:8000`.  
Interactive docs at `http://localhost:8000/docs`.

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
