# Chronicle AI service (`services/ai`)

Chronicle's local, **loopback-only** AI service: a small FastAPI + LangChain
(Python) app the Electron main process calls over `127.0.0.1` for version
annotations and text embeddings (C3).

This is **not** the control plane in `services/api/`. It is stateless, holds no
database and no auth, receives one request at a time, and **never persists the
BYOK API key or image data** — the key arrives per request and is forwarded only
to the configured provider.

## HTTP surface (C3)

| Method | Route         | Purpose |
|--------|---------------|---------|
| `GET`  | `/health`     | Confirms the process is up without calling a provider. |
| `POST` | `/annotate`   | First-version description (`previous: null`) or previous-vs-current diff. |
| `POST` | `/embed-text` | One embedding vector for a version's summary+tags or a search query. |
| `POST` | `/validate-provider-model` | Uses the supplied BYOK key to make a minimal task-specific provider call and report whether the model is reachable. |

Images cross the boundary as base64 plus `image/png` / `image/jpeg`. Provider,
model and the BYOK key arrive per request (or fall back to the env defaults
below). Annotation output is the C3 shape — `summary`, `changes`, `tags`,
nullable `confidence` — plus `usage` (token counts) and `cost` (estimated USD
from the configured per-task prices). Embedding responses carry the same
`usage`/`cost` fields, though the standard embedding interface rarely reports
token usage, so they are usually null.

Configuration validation requires an explicit provider, model, task, and API
key. Chat validation sends a one-pixel image through the real structured vision
path; embeddings validation embeds a short probe string. The key and probe are
never persisted. Because these are real provider calls, they may incur a tiny
provider charge.

## Configuration (`.env`)

The desktop app sends provider/model/key per request. For standalone runs, the
smoke script, and the live test, defaults come from the repo-root `.env`
(`main.py` loads it best-effort; shell env always wins). See `.env.example`:

| Variable | Purpose |
|---|---|
| `CHRONICLE_AI_PROVIDER` | Default LangChain provider id (e.g. `google_genai`). |
| `CHRONICLE_AI_API_KEY` | Default BYOK key (generic, provider-agnostic). |
| `CHRONICLE_AI_ANNOTATE_MODEL` | Model for `/annotate`. |
| `CHRONICLE_AI_EMBED_MODEL` | Model for `/embed-text` (separate per task). |
| `CHRONICLE_AI_ANNOTATE_INPUT_PRICE_PER_M` / `_OUTPUT_PRICE_PER_M` | Annotate pricing, USD per 1M tokens. |
| `CHRONICLE_AI_EMBED_INPUT_PRICE_PER_M` | Embedding pricing, USD per 1M tokens. |

When a request omits provider/model/key and no default is set, the service
returns `400 configuration_error` without contacting a provider.

## Layout

```
services/ai/
  pyproject.toml            # package + dev/provider extras
  chronicle_ai/
    main.py                 # FastAPI app factory
    routes.py               # the four HTTP routes + error mapping
    engine.py               # model-agnostic LangChain calls (init_chat_model / init_embeddings)
    config.py               # env-driven defaults: provider, key, per-task models + prices
    schemas.py              # strict Pydantic v2 request/response models
    prompts.py              # loads the versioned prompt from packages/prompts/
    image_loader.py         # local-file helper for fixtures / smoke tests
    export_openapi.py       # writes packages/contracts/ai/openapi.json
  tests/                    # provider-mocked contract + behaviour tests
```

## Run it

Python 3.12 required. From this directory (`services/ai`):

```bash
python -m pip install -e ".[dev]"
python -m uvicorn chronicle_ai.main:app --host 127.0.0.1 --port 8765
python -m pytest
```

Install a single provider package for focused manual development, e.g.
`python -m pip install -e ".[google]"`, or `.[providers]` for every integration shipped in the
desktop installer (Gemini, OpenAI, and Anthropic).
Automated tests mock LangChain and never contact a paid provider.

## Windows sidecar packaging

MVP-12 packages the service with PyInstaller so an installed Chronicle build does not require
system Python. Build from the repository root with a clean Python 3.12 environment:

```powershell
python -m pip install -e "services/ai[providers,bundle]"
python scripts/build_ai_sidecar.py
python scripts/smoke_ai_sidecar.py
```

The executable is generated at
`apps/desktop/build/sidecar/chronicle-ai-sidecar.exe`; electron-builder copies it and the
canonical `packages/prompts/version-annotation.md` into `resources/ai/`. Electron sets
`CHRONICLE_PROMPT_PATH` when spawning the installed sidecar. The build script uses a cached,
isolated `apps/desktop/build/sidecar-venv/` so unrelated packages from the developer's global
Python installation are not analyzed. Its smoke check imports all three packaged integrations
before probing `/health`.

## Regenerate the TypeScript client (C3)

After changing a route or Pydantic model, regenerate the OpenAPI schema and the
Electron client types (run from `apps/desktop`):

```bash
npm run generate-ai-types
```

This runs `python -m chronicle_ai.export_openapi` (writing
`packages/contracts/ai/openapi.json`) and then `openapi-typescript`.

## Security

Do not put provider keys in source files, fixtures, URLs, or logs. In production
Electron decrypts the key from `safeStorage` only while building a single
loopback request. The opt-in live acceptance test reads `GOOGLE_API_KEY` from the
environment for that developer process only; production never reads it.
