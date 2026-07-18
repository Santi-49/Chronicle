# ai

Desktop side of the AI layer (MVP-09). The AI features themselves are implemented
in Python in the **local AI service** (`services/ai/` — FastAPI + LangChain,
loopback-only; decision 2026-07-19). This module holds what stays in the Electron
main process:

- the **job worker** that drains `queue_items` (`ai_annotation`, `embedding`)
  asynchronously — the UI never waits on it (spec §6.5);
- the **typed HTTP client** for the service (types generated from its OpenAPI
  schema, C3 — never hand-written);
- passing the BYOK credential per request: the key lives in Electron
  `safeStorage` (see `../ipc/secrets.ts`) and is sent only to `127.0.0.1`,
  never persisted by the service, never sent to Chronicle's backend;
- persisting results (`saveAnnotation`, `saveEmbedding`), retries, and the
  `annotationUpdated` events.

Not the control plane: `services/api/` is unrelated to this path.
