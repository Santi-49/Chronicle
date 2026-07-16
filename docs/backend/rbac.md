# Role-Based Access Control (RBAC)

> See also: [Authentication](auth.md) · [API Reference](api-reference.md) · [Database](database.md)

Authorization is delegated entirely to **Open Policy Agent (OPA)**. The backend never hard-codes role checks — every protected endpoint calls OPA and acts on the result.

---

## How It Works

```
Request arrives (JWT already validated by get_current_user)
    │
    ▼
require_permission("users", "read")   ← declared on the route
    │
    ▼
core/opa.py  →  POST http://opa:8181/v1/data/authz/allow
    {
      "input": {
        "user_id": "uuid",
        "roles":   ["admin"],
        "resource": "users",
        "action":   "read"
      }
    }
    │
    ▼
OPA evaluates authz.rego + roles.rego
    │
    ├── allow = true  →  continue to route handler
    └── allow = false →  403 Forbidden
```

---

## Rego Policies

Policies live in [`infra/opa/policies/`](../../infra/opa/policies/).

### `authz.rego` — decision logic

```rego
package authz

default allow := false

# Admin bypasses all resource checks
allow if "admin" in input.roles

# Regular role: look up role → permission table
allow if {
    some role_name in input.roles
    some perm in data.authz.role_permissions[role_name]
    perm.resource == input.resource
    perm.action   == input.action
}
```

### `roles.rego` — permission table

```rego
package authz

role_permissions := {
    "admin": [
        {"resource": "users",       "action": "read"},
        {"resource": "users",       "action": "write"},
        ...
    ],
    "user": [
        {"resource": "hello", "action": "read"}
    ]
}
```

**To add a new resource for a hackathon challenge:**
1. Add entries to `roles.rego`
2. Add the matching rows to the Alembic migration seed (or insert directly)
3. Declare `require_permission("new_resource", "action")` on the new routes

No backend code changes needed.

---

## Seed Roles & Permissions

Seeded by [migration 001](../../services/api/alembic/versions/001_initial_schema.py) on `make migrate`.

### Roles

| Role | Description |
|---|---|
| `admin` | Full access to all resources |
| `user` | Can only call `GET /hello/protected` |

### Permission Matrix

| Resource | `read` | `write` | `delete` |
|---|---|---|---|
| `users` | admin | admin | admin |
| `roles` | admin | admin | admin |
| `permissions` | admin | admin | admin |
| `hello` | admin, user | — | — |

---

## Using `require_permission` in Code

```python
from app.core.dependencies import require_permission

@router.get("/my-resource", dependencies=[require_permission("my-resource", "read")])
async def list_my_resource(db: AsyncSession = Depends(get_db)):
    ...
```

Or when you need the authenticated user object in the handler:

```python
@router.post("/my-resource")
async def create_my_resource(
    data: MySchema,
    current_user: User = require_permission("my-resource", "write"),
    db: AsyncSession = Depends(get_db),
):
    ...
```

---

## Relevant Files

| File | Purpose |
|---|---|
| [`infra/opa/policies/authz.rego`](../../infra/opa/policies/authz.rego) | Decision rule |
| [`infra/opa/policies/roles.rego`](../../infra/opa/policies/roles.rego) | Role → permission table |
| [`app/core/opa.py`](../../services/api/app/core/opa.py) | `check_permission` HTTP call |
| [`app/core/dependencies.py`](../../services/api/app/core/dependencies.py) | `require_permission` FastAPI dependency |
