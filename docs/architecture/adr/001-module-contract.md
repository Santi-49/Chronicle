# ADR 001 — Module Contract

**Status:** Amended 2026-07-17
**Context:** [System Overview](../overview.md) · [Module Contracts](../../contracts.md)

---

## Context

In a hackathon, the challenge is unknown until it is presented. The team needs to start building infrastructure (auth, RBAC, API skeleton) before knowing what domain logic is required. Without an explicit boundary, the backend team and the challenge-logic team will either block each other or produce tightly coupled code that is hard to replace.

## Decision

If the optional gateway requires an in-process module boundary, the backend
communicates with it through the Python `Protocol` in
`packages/contracts/module/interface.py`. The contract defines operation
functionality and input/output formats only. Prompts, models, tools, algorithms,
orchestration, storage, and implementation classes remain module-owned.

Do not introduce or expand the Protocol speculatively. Prefer OpenAPI/Pydantic for
the HTTP boundary and library-native interfaces inside the implementation.

## Consequences

**Good:**
- Backend team and module team can work in parallel from Day 1.
- The API surface exposed to the frontend need not change when module logic changes.
- The module implementation can change without changing agreed operation formats.
- The contract file (`interface.py`) doubles as a communication tool — it makes the expected interface explicit and reviewable.

**Neutral:**
- Adds one extra file and one import indirection.
- The module team must implement the Protocol; duck typing means no compile-time enforcement (but `mypy --strict` will catch it if used).

**Bad:**
- If the challenge turns out to be a monolith-friendly problem, the indirection is unnecessary overhead. In that case the module can simply be imported directly and the contract can be satisfied trivially.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Microservice (HTTP) | Too much overhead for a hackathon timeline |
| Shared DB table | Couples two teams to the same schema |
| No boundary | Teams block each other; last-minute coupling causes bugs |
