# C6 — Control-Plane API Contract

> Implemented by POST-03. FastAPI's generated OpenAPI document and generated TypeScript types are
> the executable source of truth; this file explains the operation guarantees and privacy bounds.

The control plane remains non-essential to local capture, history, restore, and search. Every
desktop network operation is asynchronous. An unreachable API never blocks entry to the product.

`GET /health` is public and returns the control-plane identity and API version. Electron calls it
with a short timeout before opening an interactive Google flow. A failed preflight starts no OAuth
transaction; the UI remains local-first and offers an explicit connection retry.

## Authentication

Existing endpoints remain: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST
/api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`.

- `POST /api/v1/auth/google` accepts a short-lived Google ID token in `credential`, validates its
  signature/audience/issuer/expiry and verified email, identifies the Google account by `sub`, and
  returns Chronicle's existing JWT pair. Google access/refresh tokens are never persisted.
- `POST /api/v1/auth/google/link` performs the same validation for an authenticated Chronicle
  account. An existing password account is never silently merged by matching email.
- Electron obtains the ID token using the system browser, desktop-client loopback redirect, state,
  nonce, and PKCE S256. “System browser” means the operating system's default external browser,
  not an Electron `BrowserWindow` or webview. No OAuth client secret is bundled in the desktop app.

## Installation registration

- `POST /api/v1/installations/register` is public and idempotently upserts a client-generated UUID,
  app version, and OS family (`windows`, `macos`, `linux`, `other`). Extra fields are rejected.
- `PUT /api/v1/installations/{installation_id}/link` associates the random installation with the
  authenticated account. Installation registration is best-effort and measures installations,
  not unique people; no hardware ID, hostname, local account name, or project metadata is accepted.

## Portable account settings

- `GET /api/v1/account/settings` returns a strict schema-versioned settings payload, revision, and
  update timestamp. Telemetry is enabled by the agreed 2026-07-21 default.
- `PUT /api/v1/account/settings` requires the last observed `expected_revision`; stale writes return
  `409 revision_conflict`. The portable object contains appearance, AI mode/provider/model
  selections, sync preferences, and telemetry preference/notice metadata. It cannot contain paths,
  project or asset metadata, base URLs, API-key state, or arbitrary extra fields.

## Optional encrypted-secret sync

- `GET/PUT/DELETE /api/v1/account/secrets` stores one versioned opaque envelope per account.
- PUT uses the same optimistic revision rule. The envelope is encrypted and authenticated by the
  desktop before upload. The backend never receives plaintext provider keys or a decryption key and
  never parses/logs the envelope.
- The desktop exposes a separate signed-in-only enable checkbox. Enabling it reveals the
  passphrase and explicit save/restore actions; disabling it deletes the envelope while retaining
  local keys. The passphrase remains device-side and is never part of this contract.

## Authorization

Authenticated account/settings and secret operations require OPA `(account, read)` or `(account,
write)`, granted to `user` and `admin`. Installation registration is intentionally public;
installation linking requires an authenticated Chronicle session.

## Telemetry (POST-04)

`POST /api/v1/telemetry/batches` is public so local-mode installations can participate. Its
strict schema-version-2 envelope carries separate typed collections that the server stores in
normalised tables:

- timestamped application sessions and project removals;
- cumulative UTC-hour search counters;
- cumulative UTC-hour AI attempt/success/failure/latency counters keyed by operation,
  provider, and model;
- sanitized unexpected Node/Electron/renderer/preload errors with stable fingerprints;
- one current installation snapshot and current per-project count snapshots.

Unknown fields are rejected with 422. IDs and cumulative upserts make retries idempotent.
The request cannot contain file content, file/project names, paths, summaries, tags, embeddings,
search queries, exact sizes, credentials, or raw IP addresses.

The API derives country, region, and city from Cloudflare visitor-location headers. The origin
must be reachable only through the configured Cloudflare Tunnel; client-supplied location fields
are not accepted and `CF-Connecting-IP` is never stored.

The desktop sends at startup and once per hour only when data changed. Disabling reporting makes
one final best-effort batch, clears local telemetry even if offline, and never retries after the
user turns it off. A final batch removes current installation/project snapshots. Minimal
installation registration remains a separately disclosed operation.
