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

## MVP service surface (C3, decided 2026-07-19)

`POST /annotate` (two-image diff; `previous: null` → first-version description) ·
`POST /embed-text` · `GET /health`. Annotation output: `summary`, `changes[]`,
`tags[]`, optional nullable `confidence`. Image embeddings and a history chatbot
are roadmap — `/embed-image` and `/chat` must not be built before the MVP is done.

## Transitional note — Python files currently in this folder

The first MVP-09 spike (branch `feat/mvp-09-python-ai`) started the Python
pipeline here before the `services/ai/` decision landed. Status and destination:

| File | Status | Destination |
|---|---|---|
| `schemas.py` | Implemented (Pydantic models) | Move to `services/ai/`; port to Pydantic v2 (`field_validator`, `min_length`) and add optional `confidence` per C3 |
| `image_loader.py` | Implemented | Move to `services/ai/` (internal helper) |
| `gemini_engine.py` | Implemented, Gemini-pinned | Move and generalize: model-agnostic via LangChain defaults (`init_chat_model`); provider/model/key arrive per request |
| `cli.py` | Empty stub | **Superseded** — the Electron↔Python bridge is the FastAPI HTTP endpoint, not a stdin/stdout CLI |
| `compare_images.py` | Empty stub | Becomes the `/annotate` route/orchestration in `services/ai/` |
| `tests/` | Empty stubs | pytest suite in `services/ai/` (engine mocked; no paid calls in CI) |

Once the move is complete this folder contains only TypeScript (worker + client)
and this README's transitional section should be deleted.
