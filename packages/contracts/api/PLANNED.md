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

All telemetry endpoints are public (no Chronicle account required) so local-mode installations
can participate when opted in. The installation ID from the request body is the only identity
link; no account or device identity is required.

- `POST /api/v1/telemetry/events` accepts a batch of 1–100 discriminated events. Unknown or
  extra fields are rejected with 422. Duplicate event IDs are silently ignored for idempotent
  retry. Event types: `app_opened`, `version_captured`, `ai_summary_generated`,
  `search_performed`. No event may contain file content, file names or paths, project names or
  descriptions, AI summaries, tags, search queries, exact byte sizes, or Chronicle/asset IDs.
- `PUT /api/v1/telemetry/projects/{project_telemetry_id}?installation_id=…` upserts an
  allowlisted per-project inventory: total tracked-file count and a map of counts by normalised
  file type (`png`, `jpg`, `other`). No name, path, description, or database ID is accepted.
- `DELETE /api/v1/telemetry/projects/{project_telemetry_id}?installation_id=…` removes the
  inventory record. Silently succeeds if already absent.

Disabling telemetry in Settings clears the local queue immediately and sends DELETE for every
known project inventory record. Minimal installation registration (POST-03) is a separately
disclosed operation that continues regardless of the telemetry preference.
