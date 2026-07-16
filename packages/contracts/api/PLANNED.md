# C6 — Control-Plane API Contract (minimal, low priority)

> The control plane is **non-essential** (spec F1/F8): the app runs fully without it.
> This page fixes the *planned* shapes so the desktop `gateway-client` and the backend can
> be built independently — whenever someone actually picks this up. On implementation the
> shapes become Pydantic schemas, and TypeScript types are **generated** with
> `make generate-types` (never hand-written; this page is then just documentation).

Auth (`/api/v1/auth/*`: register, login, refresh, logout, me) is **pre-built** — the app
uses it as-is. Only two additions are planned:

---

## `POST /api/v1/telemetry/events` (F8)

Batch upload, sent by the app's offline queue when online and signed in and opted in.

```jsonc
// request
{
  "events": [
    {
      "type": "app_opened" | "version_captured" | "ai_summary_generated" | "search_performed",
      "at": "2026-07-17T10:00:00Z",
      // optional, type-dependent — ONLY these keys:
      "props": { "sizeBytes": 123, "fileType": "png", "latencyMs": 900, "provider": "anthropic", "matchedBy": "semantic" }
    }
  ]
}
// response: 202 { "accepted": 3 }
```

**Privacy rule (hard, spec F8):** no file contents, no file names, no paths, no summaries,
no tags, no queries — counts, sizes, types, and timings only. The backend rejects unknown
`props` keys.

## `GET /api/v1/account/config` · `PUT /api/v1/account/config` (F1)

Small per-user JSON blob so preferences survive reinstalls. **The BYOK API key is never
part of it** (it never leaves the machine).

```jsonc
// GET response / PUT request body
{ "aiMode": "local" | "gateway", "telemetryOptIn": true }
// PUT response: 200 with the stored config
```

## RBAC

New OPA entries when implemented: `(telemetry, create)` for role `user`;
`(telemetry, read)` for role `admin` (aggregates read via Swagger `/docs`, spec §3).

## Stretch (F9) — not planned in detail yet

`POST /api/v1/ai/annotate` + `POST /api/v1/ai/embed`, proxying the module contract
(`packages/contracts/module/interface.py`), same shapes as `packages/contracts/ai/`.
Defined when F9 starts — not before.
