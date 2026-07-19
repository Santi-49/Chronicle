# AI service spike

Temporary home of Chronicle's Python AI service for MVP-09. The code already follows
the final FastAPI + LangChain boundary, but remains here briefly so the team can iterate
before moving the package to `services/ai/`.

This is not the control plane in `services/api/`. It is a stateless, loopback-only
process that receives one request at a time and never persists API keys or image data.

## MVP HTTP surface

- `GET /health` — confirms that the local process is running without calling a provider.
- `POST /annotate` — describes a first version or compares previous and current images.
- `POST /embed-text` — creates a vector for semantic search.

Images cross the HTTP boundary as base64 plus `image/png` or `image/jpeg`. Provider,
model and BYOK key arrive per request. Annotation output is the C3 shape: `summary`,
`changes`, `tags` and nullable `confidence`.

## Run it temporarily

Python 3.12 is required. From the repository root:

```bash
python -m pip install -e "apps/desktop/src/main/ai[dev]"
python -m uvicorn apps.desktop.src.main.ai.main:app --host 127.0.0.1 --port 8765
python -m pytest apps/desktop/src/main/ai/tests
```

Install only the provider packages used for manual tests, for example
`langchain-google-genai` for the current demo configuration. Automated tests mock
LangChain and never contact a paid provider.

Do not place provider keys in environment variables, source files, fixtures, URLs or
logs. Electron will eventually decrypt the key from `safeStorage` only while creating
one local request.

## Files

| File | Purpose |
|---|---|
| `main.py` | Creates the FastAPI application. |
| `compare_images.py` | Defines the three small HTTP routes. |
| `schemas.py` | Strict Pydantic v2 request and response validation. |
| `model_engine.py` | Model-agnostic `init_chat_model` and `init_embeddings` calls. |
| `prompts.py` | Loads the versioned prompt from `packages/prompts/`. |
| `tests/` | Provider-mocked contract and behavior tests. |

`image_loader.py` remains a local helper from the first spike, but HTTP requests use
the portable base64 contract rather than filesystem paths. `cli.py` is intentionally
empty and superseded by FastAPI.

## Still pending on the Electron side

The TypeScript queue worker, generated HTTP client, safe retries, result persistence,
service-process lifecycle and status events remain MVP-09 work. Once this Python package
moves to `services/ai/`, this folder will contain only those Electron components.
