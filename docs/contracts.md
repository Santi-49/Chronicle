# Module Contracts

> See also: [ADR 001 — Module Contract](architecture/adr/001-module-contract.md) · [System Overview](architecture/overview.md) · [Backend Overview](backend/overview.md)

This page explains how challenge-specific logic is wired into the backend without coupling the two teams together.

---

## The Problem

A hackathon starts with unknown requirements. The infrastructure team (auth, RBAC, API skeleton) and the challenge-logic team need to work in parallel from minute one. Without a boundary they will either block each other or produce code that is tangled together and hard to change under time pressure.

## The Solution

A **contract** is a Python `Protocol` class that lives in `packages/contracts/module/interface.py`. It defines exactly what the backend expects from the module — method names, argument types, return types. The backend imports the Protocol; the module implements it. The two teams converge only at this interface.

---

## Workflow

### Step 1 — Challenge announced

Fill in `packages/contracts/module/interface.py`:

```python
from typing import Protocol
from dataclasses import dataclass

@dataclass
class ProcessInput:
    user_id: str
    payload: dict

@dataclass
class ProcessOutput:
    result: dict
    confidence: float

class ModuleContract(Protocol):
    async def process(self, input: ProcessInput) -> ProcessOutput: ...
    async def health(self) -> bool: ...
```

Both teams agree on this file. It is the single source of truth.

### Step 2 — Module team implements

```python
# services/module/app/implementation.py
from packages.contracts.module.interface import ModuleContract, ProcessInput, ProcessOutput

class ChallengeModule:
    async def process(self, input: ProcessInput) -> ProcessOutput:
        # challenge-specific logic here
        return ProcessOutput(result={}, confidence=1.0)

    async def health(self) -> bool:
        return True
```

### Step 3 — Backend team consumes

```python
# services/api/app/services/challenge_service.py
from packages.contracts.module.interface import ModuleContract, ProcessInput

async def run(module: ModuleContract, user_id: str, payload: dict):
    result = await module.process(ProcessInput(user_id=user_id, payload=payload))
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
