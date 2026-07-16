# Documentation

## Architecture
- [System Overview](architecture/overview.md) — services, request flow, component map
- [ADR 001 — Module Contract](architecture/adr/001-module-contract.md) — why the module boundary exists

## Backend
- [Backend Overview](backend/overview.md) — stack, folder structure, how to run
- [Authentication](backend/auth.md) — JWT flow, Redis whitelist, token lifecycle
- [RBAC](backend/rbac.md) — OPA policies, roles, permissions, how to extend
- [API Reference](backend/api-reference.md) — all endpoints with request/response shapes
- [Database](backend/database.md) — schema, models, Alembic migrations

## Challenge
- [Challenge](challenge/CHALLENGE.md) — problem statement, rules, data, judging criteria
- [Vision](challenge/VISION.md) — solution concept, key features, demo script
- [Constraints](challenge/CONSTRAINTS.md) — scope, team, timeline, design language
- [Research](challenge/RESEARCH.md) — company background, market context, recommendations

## Hackathon Workflow
- [Getting Started](getting-started.md) — setup, repo orientation, and contracts explained for humans
- [Module Contracts](contracts.md) — how to wire challenge-specific logic into the backend
- [Onboarding](onboarding.md) — Day-0 setup for new teammates
- [MCP Servers](mcp-servers.md) — AI agent tooling: Postgres, Playwright, Docker, Fetch, MarkItDown
