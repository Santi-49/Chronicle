# Contracts and Implementation Specifications

> See also: [ADR 001 — Module Contract](architecture/adr/001-module-contract.md) · [System Overview](architecture/overview.md) · [Backend Overview](backend/overview.md)

This page explains how challenge-specific logic is wired into the backend without coupling the two teams together.

---

## Chronicle Contract Map (Jul 18 milestone — agree here before implementing)

Chronicle is local-first, so the UI's "backend" is the **Electron main process** (watcher, SQLite, AI jobs) — the renderer talks to it over IPC. That makes C1 the highest-value contract; the FastAPI boundary (C5/C6) is deliberately minimal because the control plane is lowest priority.

A contract defines an operation's functionality and the format of its inputs,
outputs, errors, and externally observable guarantees. It does **not** define the
implementation: prompts, algorithms, tools, agents, retries, storage layout,
provider choices, internal classes, or orchestration remain implementation-owned.

Contract changes require coordinated updates to generated types, compatibility
tests, migrations, and documentation where relevant. They are not artificially
restricted to a one-file PR.

| ID | Boundary | Fixes what | Single source of truth | Priority |
|----|----------|-----------|------------------------|----------|
| **C1** | Renderer (React) ↔ Main process | IPC channel names + request/response/event types for every feature: folders, assets, timeline, version details, restore, search, AI status/retry, settings, account | `apps/desktop/src/shared/ipc.ts` (one TS file imported by main, preload, and renderer) | **Highest** |
| **C2** | Persistence behavior | Repository operations and domain data returned to callers. The SQLite DDL is an implementation specification, not a public contract. | Contract to be defined with the versioning implementation; implementation at `apps/desktop/src/main/db/schema.sql` | High |
| **C3** | App ↔ AI functionality | Annotation and embedding operation functionality plus typed inputs/outputs. Prompts and pipelines may differ between implementations. | `packages/contracts/ai/` (`interface.ts` + `output.schema.json`) | High |
| **C4** | Filesystem ↔ watcher | Candidate-evaluation input/output, rejection reasons, supported formats, settle guarantee, and size cap. Globs, regexes, event handling, and debounce algorithms are implementation details. | `apps/desktop/src/main/watcher/rules.ts` | High |
| **C5** | Everything ↔ settings | Typed settings read/write data and the security guarantee that secrets never enter the renderer-visible settings object. Defaults and supported-provider discovery are implementation policy. | `apps/desktop/src/shared/settings.ts` | High |
| **C6** | App ↔ control-plane API | **Minimal:** only `POST /telemetry/events` (batch) + `GET/PUT /account/config` on top of the pre-built auth endpoints → `make generate-types` when implemented | `packages/contracts/api/` (planned shapes in `PLANNED.md` → OpenAPI → generated TS) | Low |
| **C7** | Backend ↔ module | Optional gateway operations and Python input/output formats. Its implementation need not mirror the desktop-side AI pipeline. | `packages/contracts/module/interface.py` | Stretch |

Prompt assets live only in `packages/prompts/` as Markdown with YAML front matter.
Every process that uses a repository prompt loads it from there. Prompt revisions are
implementation experiments unless they change a contract's input or output format.

---

## The Problem

A hackathon starts with unknown requirements. The infrastructure team (auth, RBAC, API skeleton) and the challenge-logic team need to work in parallel from minute one. Without a boundary they will either block each other or produce code that is tangled together and hard to change under time pressure.

## The Solution

Use the native contract mechanism for each real boundary: TypeScript types for IPC,
JSON Schema for portable structured data, OpenAPI/Pydantic for HTTP, and a Python
`Protocol` only when the backend actually needs an in-process callable boundary.
Prefer schemas and library-native interfaces over custom wrapper classes.

---

## Workflow

### Step 1 — Challenge announced

Fill in `packages/contracts/module/interface.py`:

```python
from typing import Protocol, TypedDict

class ProcessInput(TypedDict):
    user_id: str
    payload: dict

class ProcessOutput(TypedDict):
    result: dict
    confidence: float

class ModuleContract(Protocol):
    async def process(self, input: ProcessInput) -> ProcessOutput: ...
```

Both teams agree on the operation's functionality and I/O. The module team remains
free to research and change how the result is produced.

### Step 2 — Module team implements

```python
# services/module/app/implementation.py
from packages.contracts.module.interface import ModuleContract, ProcessInput, ProcessOutput

class ChallengeModule:
    async def process(self, input: ProcessInput) -> ProcessOutput:
        # challenge-specific logic here
        return {"result": {}, "confidence": 1.0}
```

### Step 3 — Backend team consumes

```python
# services/api/app/services/challenge_service.py
from packages.contracts.module.interface import ModuleContract, ProcessInput

async def run(module: ModuleContract, user_id: str, payload: dict):
    result = await module.process({"user_id": user_id, "payload": payload})
    return result
```

The backend imports and calls the Protocol type. Python's structural subtyping means any class with the right methods satisfies the contract — no inheritance needed.

---

## Frontend ↔ Backend Contract

FastAPI auto-generates an OpenAPI spec from the Pydantic schemas. The frontend consumes TypeScript types generated from this spec.

```bash
make generate-types
# → writes packages/contracts/api/openapi.yaml
# → writes packages/contracts/api/generated/index.ts
```

Frontend code imports from `packages/contracts/api/generated/index.ts`. When the backend adds a new endpoint or changes a schema, regenerate types and TypeScript will surface any breakage at compile time.

---

## Adding a New Resource (Challenge Workflow)

1. Add a Pydantic schema in `services/api/app/schemas/`
2. Add a service function in `services/api/app/services/`
3. Add a route in `services/api/app/api/v1/endpoints/`
4. Add `(resource, action)` entries to `infra/opa/policies/roles.rego`
5. Add the matching permissions to the next Alembic migration seed
6. Run `make generate-types` so the frontend gets updated types
