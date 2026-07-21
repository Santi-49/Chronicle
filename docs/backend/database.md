# Database

> See also: [Backend Overview](overview.md) · [RBAC](rbac.md)

PostgreSQL 16 managed via **SQLAlchemy 2.0 (async)** and **Alembic** migrations.

---

## Schema

```
┌──────────────┐       ┌──────────────┐       ┌─────────────────┐
│    users     │       │  user_roles  │       │     roles        │
│──────────────│       │──────────────│       │─────────────────│
│ id (PK)      │──┐    │ user_id (FK) │    ┌──│ id (PK)         │
│ email        │  └───▶│ role_id (FK) │◀───┘  │ name            │
│ name         │       └──────────────┘       │ description     │
│ surname      │                              └────────┬────────┘
│ hashed_pw    │                                       │
│ is_active    │                              ┌────────▼────────┐
│ created_at   │       ┌──────────────────┐   │ role_permissions│
│ updated_at   │       │   permissions    │   │─────────────────│
└──────────────┘       │──────────────────│   │ role_id (FK)    │
                       │ id (PK)          │◀──│ permission_id   │
                       │ resource         │   └─────────────────┘
                       │ action           │
                       │ description      │
                       └──────────────────┘
```

---

## Table Reference

### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `name` | VARCHAR(100) | NOT NULL |
| `surname` | VARCHAR(100) | NOT NULL |
| `hashed_password` | VARCHAR(255) | nullable for Google-only accounts |
| `is_active` | BOOLEAN | NOT NULL, default `true` |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()`, auto-update |

Index: `ix_users_email` on `email`.

### `roles`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL |
| `description` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL |
| `updated_at` | TIMESTAMPTZ | NOT NULL |

### `permissions`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `resource` | VARCHAR(100) | NOT NULL |
| `action` | VARCHAR(50) | NOT NULL |
| `description` | TEXT | nullable |

Unique constraint: `(resource, action)`.

### `user_roles` (join)

| Column | Type | Constraints |
|---|---|---|
| `user_id` | UUID | FK → `users.id` ON DELETE CASCADE |
| `role_id` | UUID | FK → `roles.id` ON DELETE CASCADE |

PK: `(user_id, role_id)`.

### `role_permissions` (join)

| Column | Type | Constraints |
|---|---|---|
| `role_id` | UUID | FK → `roles.id` ON DELETE CASCADE |
| `permission_id` | UUID | FK → `permissions.id` ON DELETE CASCADE |

PK: `(role_id, permission_id)`.

### POST-03 control-plane tables

Migration 002 adds:

- `external_identities`: Chronicle user FK, provider, stable provider subject, and last-login
  timestamp; unique by `(provider, provider_subject)` and `(user_id, provider)`.
- `account_settings`: one strict JSON payload per user with optimistic `revision`.
- `encrypted_secrets`: one opaque client-encrypted envelope per user with optimistic `revision`.
- `installations`: random installation UUID, optional linked user, app version, OS family, and
  first/last-seen timestamps. It contains no hardware ID, hostname, paths, or project data.

---

## SQLAlchemy Models

Models live in [`services/api/app/models/`](../../services/api/app/models/).

All models inherit from `Base` (declarative) and `UUIDMixin` (UUID PK with auto-default). Timestamp columns come from `TimestampMixin`.

Relationships use `lazy="selectin"` so related objects are always loaded in a single additional query rather than triggering N+1 on attribute access.

---

## Migrations

Alembic is configured in [`services/api/alembic/`](../../services/api/alembic/). The env reads `DATABASE_URL` from the environment, so the same migration file works in Docker and CI.

```bash
# Apply all pending migrations (also runs seed data on first run)
make migrate

# Create a new migration after changing models
# Requires the dev stack to be running (make dev) — exec writes the file
# into the live container, which is volume-mounted back to services/api/
make makemigration MSG="add payments table"
# → generates services/api/alembic/versions/<rev>_add_payments_table.py

# Roll back one step
docker compose exec api alembic downgrade -1
```

### Migration 001 — Initial Schema

[`alembic/versions/001_initial_schema.py`](../../services/api/alembic/versions/001_initial_schema.py) creates all five tables and seeds:

- Roles: `admin`, `user`
- Permissions: full matrix (`users`, `roles`, `permissions`, `hello`) × (`read`, `write`, `delete`)
- Role assignments: `admin` → all permissions, `user` → `hello:read`
- First admin user: from `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` env vars

### Migration 002 — Chronicle Control Plane

[`alembic/versions/002_control_plane_accounts.py`](../../services/api/alembic/versions/002_control_plane_accounts.py)
makes password hashes nullable, creates the four POST-03 tables, and grants `account:read/write`
to both `user` and `admin`. Verified against PostgreSQL 16 on 2026-07-21.
