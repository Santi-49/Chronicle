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

Images cross the boundary as base64 plus `image/png` / `image/jpeg`. Provider,
model and the BYOK key arrive per request. Annotation output is the C3 shape:
`summary`, `changes`, `tags`, and nullable `confidence`.

## Layout

```
services/ai/
  pyproject.toml            # package + dev/provider extras
  chronicle_ai/
    main.py                 # FastAPI app factory
    routes.py               # the three HTTP routes + error mapping
    engine.py               # model-agnostic LangChain calls (init_chat_model / init_embeddings)
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

Install only the provider package used for manual tests, e.g.
`python -m pip install -e ".[google]"` for the current demo configuration.
Automated tests mock LangChain and never contact a paid provider.

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
