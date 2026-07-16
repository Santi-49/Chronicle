# ADR 001 — Module Contract

**Status:** Accepted  
**Context:** [System Overview](../overview.md) · [Module Contracts](../../contracts.md)

---

## Context

In a hackathon, the challenge is unknown until it is presented. The team needs to start building infrastructure (auth, RBAC, API skeleton) before knowing what domain logic is required. Without an explicit boundary, the backend team and the challenge-logic team will either block each other or produce tightly coupled code that is hard to replace.

## Decision

Isolate all challenge-specific logic inside `services/module/`. The backend (`services/api/`) communicates with this module exclusively through a Python `Protocol` class defined in `packages/contracts/module/interface.py`.

The contract is established before the challenge is known (it is a placeholder at template creation time) and filled in once the challenge is announced.

## Consequences

**Good:**
- Backend team and module team can work in parallel from Day 1.
- The API surface exposed to the frontend never changes shape when module logic changes.
- The module can be swapped or extended without touching auth, RBAC, or routing code.
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
