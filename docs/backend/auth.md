# Authentication

> See also: [RBAC](rbac.md) · [API Reference](api-reference.md) · [Backend Overview](overview.md)

The API uses **JWT + Redis whitelist** authentication. Tokens are never trusted solely by their signature — they must exist in Redis to be valid. This gives instant, reliable logout and easy revocation.

---

## Token Design

| Token | Algorithm | TTL | Claim `type` |
|---|---|---|---|
| Access token | HS256 | 30 min (configurable) | `"access"` |
| Refresh token | HS256 | 7 days (configurable) | `"refresh"` |

Both tokens carry `sub` (user UUID), `jti` (unique token ID), `type`, and `exp`.

---

## Redis Key Layout

| Key | Value | TTL |
|---|---|---|
| `token:{access_jti}` | `user_id` | = `ACCESS_TOKEN_EXPIRE_MINUTES` × 60 s |
| `token:{refresh_jti}` | `user_id` | = `REFRESH_TOKEN_EXPIRE_DAYS` × 86400 s |
| `refresh:{user_id}` | `refresh_jti` | = same as refresh token |

The `refresh:{user_id}` key lets logout revoke the refresh token without the client sending it.

---

## Flows

### Google desktop sign-in

Chronicle uses a Google OAuth client of type **Desktop app**. Electron opens the system browser,
binds a temporary random `127.0.0.1` callback, and uses state + nonce + PKCE S256. It exchanges the
one-time authorization code locally and sends only the short-lived Google ID token to `POST
/api/v1/auth/google`. The API verifies the Google signature, `aud`, issuer, expiry, and verified
email with `google-auth`, keys identities by the stable `sub` claim, then issues the same Chronicle
JWT pair used by password login. Google access/refresh tokens are never stored.

If the Google email already belongs to a password account, login returns
`409 account_link_required`; the signed-in user must call `POST /auth/google/link`. Chronicle never
merges accounts by email alone. Google-only users have a null `hashed_password` and cannot use the
password endpoint unless a future password-setting flow is added.

### Login

```
POST /api/v1/auth/login
  { email, password }

1. Verify email exists + bcrypt matches
2. Generate access_token  (jti = uuid4, exp = now + 30 min)
3. Generate refresh_token (jti = uuid4, exp = now + 7 days)
4. Redis SET token:{access_jti}   → user_id   EX 1800
5. Redis SET token:{refresh_jti}  → user_id   EX 604800
6. Redis SET refresh:{user_id}    → refresh_jti EX 604800
7. Return { access_token, refresh_token, token_type: "bearer" }
```

### Authenticated Request

```
GET /api/v1/some/protected/route
Authorization: Bearer <access_token>

1. HTTPBearer extracts the token
2. python-jose decodes + verifies signature and exp
3. Assert payload.type == "access"
4. Redis EXISTS token:{jti}  →  must be 1  (whitelist check)
5. Load User from DB by UUID(payload.sub)
6. Assert user.is_active == True
7. Inject user into request — downstream can call require_permission()
```

### Logout

```
POST /api/v1/auth/logout
Authorization: Bearer <access_token>

1. Validate access_token (same as authenticated request)
2. Decode access_jti from token
3. Redis GET refresh:{user_id}  →  refresh_jti
4. Redis DEL token:{access_jti}
5. Redis DEL token:{refresh_jti}
6. Redis DEL refresh:{user_id}
7. 204 No Content
```

### Refresh

```
POST /api/v1/auth/refresh
Authorization: Bearer <refresh_token>

1. Decode refresh_token
2. Assert payload.type == "refresh"
3. Redis EXISTS token:{refresh_jti}  →  must exist
4. Redis DEL token:{refresh_jti}              ← old refresh is dead (rotation)
5. Redis DEL refresh:{user_id}
6. Issue new access_token + new refresh_token
7. Store both in Redis
8. Return new TokenPair
```

---

## Error Codes

| HTTP | When |
|---|---|
| `401` | Missing token, invalid signature, expired token, token revoked |
| `403` | Token valid but OPA denied the action |
| `409` | Email already registered (register endpoint) |
| `409` | Google email needs explicit account linking, or identity already linked elsewhere |
| `503` | `GOOGLE_OAUTH_CLIENT_ID` is not configured |

---

## Relevant Files

| File | Purpose |
|---|---|
| [`app/core/security.py`](../../services/api/app/core/security.py) | `create_token`, `decode_token`, `hash_password`, `verify_password` |
| [`app/core/redis.py`](../../services/api/app/core/redis.py) | `store_token`, `token_exists`, `revoke_token`, refresh JTI helpers |
| [`app/core/dependencies.py`](../../services/api/app/core/dependencies.py) | `get_current_user` FastAPI dependency |
| [`app/services/auth_service.py`](../../services/api/app/services/auth_service.py) | `register_user`, `issue_tokens`, `revoke_tokens`, `refresh_tokens` |
| [`app/api/v1/endpoints/auth.py`](../../services/api/app/api/v1/endpoints/auth.py) | Route handlers |
