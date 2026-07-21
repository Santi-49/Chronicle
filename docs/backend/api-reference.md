# API Reference

> See also: [Authentication](auth.md) · [RBAC](rbac.md) · [Backend Overview](overview.md)

Base URL: `http://localhost:8000/api/v1`  
Interactive docs (Swagger UI): `http://localhost:8000/docs`  
OpenAPI JSON: `http://localhost:8000/openapi.json`

**Auth column legend:**
- `—` public
- `JWT` valid access token required
- `JWT + OPA` valid token **and** OPA `allow = true` for the listed resource:action

---

## Auth

### `POST /auth/register`

Create a new user. Assigns the `user` role by default.

**Auth:** —

**Request body:**
```json
{
  "email": "alice@example.com",
  "name": "Alice",
  "surname": "Smith",
  "password": "secret123"
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "email": "alice@example.com",
  "name": "Alice",
  "surname": "Smith",
  "is_active": true,
  "created_at": "...",
  "updated_at": "...",
  "roles": ["user"]
}
```

**Errors:** `409` email already registered

---

### `POST /auth/login`

**Auth:** —

**Request body:**
```json
{ "email": "alice@example.com", "password": "secret123" }
```

**Response `200`:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Errors:** `401` invalid credentials, `403` account inactive

---

### `POST /auth/google`

Exchange a Google ID token obtained by Electron's system-browser desktop PKCE flow for Chronicle's
JWT pair. Google tokens are validated and discarded.

**Auth:** —
**Request:** `{ "credential": "<google-id-token>" }`
**Response `200`:** `TokenPair`
**Errors:** `401` invalid/unverified Google identity · `409` explicit link required · `503` OAuth not configured

### `POST /auth/google/link`

Link a validated Google `sub` to the current Chronicle account.

**Auth:** JWT
**Request:** `{ "credential": "<google-id-token>" }`
**Response:** `204 No Content`

---

### `POST /auth/logout`

Revokes both the access and refresh tokens immediately.

**Auth:** JWT

**Response:** `204 No Content`

---

### `POST /auth/refresh`

Exchange a valid refresh token for a new token pair (old refresh token is rotated and invalidated).

**Auth:** JWT (send the **refresh token** as the Bearer token)

**Response `200`:** same shape as `/auth/login`

**Errors:** `401` invalid / revoked / wrong token type

---

### `GET /auth/me`

**Auth:** JWT

**Response `200`:** `UserWithRoles` (same shape as register response)

---

## Installations

### `POST /installations/register`

Best-effort, idempotent registration of a random client-generated installation UUID.

**Auth:** —
**Request:** `{ "installation_id": "uuid", "app_version": "0.1.0", "os_family": "windows" }`
**Privacy:** schema rejects hostnames, hardware IDs, paths, project metadata, and extra fields.

### `PUT /installations/{installation_id}/link`

Associates the random installation with the current account. **Auth:** JWT.

---

## Account

### `GET /account/settings` · `PUT /account/settings`

**Auth:** JWT + OPA `account:read` / `account:write`. Returns or updates the strict portable
settings object plus `revision` and `updated_at`. PUT includes `expected_revision`; stale writes
return `409 revision_conflict`. Portable fields are appearance theme, AI mode/provider/models,
settings/key-sync preferences, and telemetry preference/notice metadata. Device paths, project
metadata, base URLs, secrets, and unknown properties are rejected.

### `GET /account/secrets` · `PUT /account/secrets` · `DELETE /account/secrets`

**Auth:** JWT + OPA `account:read` / `account:write`. Stores one versioned opaque envelope. The
desktop performs scrypt key derivation and AES-256-GCM encryption; the API never receives the
passphrase, plaintext provider keys, or a decryption key. Missing GET returns `404`; stale PUT
returns `409 revision_conflict`; DELETE returns `204`.

---

## Users

### `GET /users`

**Auth:** JWT + OPA `users:read`

**Response `200`:** `list[UserWithRoles]`

---

### `GET /users/{user_id}`

**Auth:** JWT + OPA `users:read`

**Response `200`:** `UserWithRoles`  
**Errors:** `404`

---

### `PATCH /users/{user_id}`

**Auth:** JWT + OPA `users:write`

**Request body** (all fields optional):
```json
{ "name": "Alice", "surname": "Smith", "email": "new@example.com", "is_active": true }
```

**Response `200`:** `UserWithRoles`

---

### `DELETE /users/{user_id}`

Soft-delete: sets `is_active = false`. Does not remove the row.

**Auth:** JWT + OPA `users:delete`

**Response:** `204 No Content`

---

### `PUT /users/{user_id}/roles`

Replace the user's role set entirely.

**Auth:** JWT + OPA `users:write`

**Request body:**
```json
{ "role_ids": ["uuid-of-role-1", "uuid-of-role-2"] }
```

**Response `200`:** `UserWithRoles`  
**Errors:** `404` if any role_id not found

---

## Roles

### `GET /roles`

**Auth:** JWT + OPA `roles:read`

**Response `200`:** `list[RoleRead]`

---

### `POST /roles`

**Auth:** JWT + OPA `roles:write`

**Request body:**
```json
{ "name": "editor", "description": "Can edit content" }
```

**Response `201`:** `RoleRead`  
**Errors:** `409` name already exists

---

### `GET /roles/{role_id}`

**Auth:** JWT + OPA `roles:read`

**Response `200`:** `RoleRead`  
**Errors:** `404`

---

### `PATCH /roles/{role_id}`

**Auth:** JWT + OPA `roles:write`

**Request body** (all optional):
```json
{ "name": "editor-v2", "description": "Updated description" }
```

**Response `200`:** `RoleRead`

---

### `DELETE /roles/{role_id}`

**Auth:** JWT + OPA `roles:delete`

**Response:** `204 No Content`

---

### `PUT /roles/{role_id}/permissions`

Replace the role's permission set entirely.

**Auth:** JWT + OPA `roles:write`

**Request body:**
```json
{ "permission_ids": ["uuid-of-perm-1", "uuid-of-perm-2"] }
```

**Response `200`:** `RoleRead` (includes `permissions` array)  
**Errors:** `404` if any permission_id not found

---

## Permissions

### `GET /permissions`

**Auth:** JWT + OPA `permissions:read`

**Response `200`:** `list[PermissionRead]`

---

### `POST /permissions`

**Auth:** JWT + OPA `permissions:write`

**Request body:**
```json
{ "resource": "documents", "action": "read", "description": "Read documents" }
```

**Response `201`:** `PermissionRead`  
**Errors:** `409` `(resource, action)` already exists

---

### `DELETE /permissions/{perm_id}`

**Auth:** JWT + OPA `permissions:delete`

**Response:** `204 No Content`  
**Errors:** `404`

---

## Hello (Demo)

### `GET /hello`

Public smoke-test endpoint.

**Auth:** —

**Response `200`:**
```json
{ "message": "Hello, world!" }
```

---

### `GET /hello/protected`

Demonstrates the full auth + RBAC path. Returns the caller's name.

**Auth:** JWT + OPA `hello:read`

**Response `200`:**
```json
{ "message": "Hello, Alice Smith!" }
```
