# AI integration (Electron main)

The TypeScript half of Chronicle's AI feature (MVP-09). It runs in the Electron
**main process** and drives the local Python AI service in
[`services/ai`](../../../../../services/ai/README.md) over `127.0.0.1`.

The Python service (FastAPI + LangChain) lives in `services/ai/`; only the queue
worker, the typed HTTP client, and the process lifecycle stay here.

## Files

| File | Purpose |
|---|---|
| `client.ts` | Typed loopback HTTP client for the AI service (C3), generated types + `AiServiceError`. |
| `generated.ts` | HTTP types generated from the service's OpenAPI schema. Do not hand-edit. |
| `service-process.ts` | Starts repository Python in development or the bundled executable from Electron resources in installed builds. |
| `worker.ts` | FIFO worker: drains annotation/embedding jobs and persists their results. |
| `worker.test.ts` | Provider-mocked worker behaviour tests. |
| `worker.live.test.ts` | Opt-in live acceptance test (skipped without `GOOGLE_API_KEY`). |

## Behaviour

Electron starts the service at startup, health-checks it, and processes one
queued job at a time. Annotation output is stored before an embedding job is
created. Offline and service-down states leave jobs untouched. Failure handling:

- **Non-retryable errors** (4xx: bad key, invalid request, invalid model output,
  provider quota/rate limit) become retained failed jobs immediately — retrying
  automatically would fail identically or consume/throttle the user's API budget.
- **Retryable errors** (5xx, network) retry up to three times, then mark the
  queue row failed without deleting it.
- Failed annotation and embedding jobs never run automatically. Pending jobs
  displays their sanitized last error and provides an explicit **Retry all
  failed jobs** action; the per-version **Retry AI** action requeues one failed
  annotation.

Installed Windows builds include a PyInstaller Gemini/OpenAI/Anthropic sidecar and canonical prompt under
`resources/ai`; they do not require system Python. Development still runs uvicorn from
`services/ai`. Either path stays loopback-only and is terminated with the Electron lifecycle.

## Regenerate C3 client types

```bash
npm run generate-ai-types
```

Runs `python -m chronicle_ai.export_openapi` in `services/ai` then
`openapi-typescript`. See [`services/ai/README.md`](../../../../../services/ai/README.md)
for running and testing the Python service itself.
