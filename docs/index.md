# Documentation

## Start Here

- [Whole-Project Overview](PROJECT_OVERVIEW.md) — plain-language product, architecture,
  contracts, branch workflow, glossary, and reading guide for every team member
- [Project Status](../PROJECT_STATUS.md) — current stage, component readiness, blockers,
  decisions, milestones, and immediate next actions
- [MVP Task Board](../TODO.md) — claimable tasks with dependencies, file boundaries,
  contracts, acceptance checks, and human decisions

## Team Direction
- [Team Spec](spec.md) — **read first**: tech stack, best practices, MVP functionality, risks
- [Desktop App Overview](desktop/overview.md) — UI pages, layout, startup flow, feature → page coverage
- [IBM Bob Usage Log](bob-log.md) — every PR adds a line; feeds the judged README section

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
- [Contracts](contracts.md) — operation behavior, input/output boundaries, and implementation specifications
- [Onboarding](onboarding.md) — Day-0 setup for new teammates
- [MCP Servers](mcp-servers.md) — AI agent tooling: Postgres, Playwright, Docker, Fetch, MarkItDown
- [Versions, CI, and Releases](releasing.md) — version rules, GitHub setup, promotion, and release runbook
- [MVP-12 Acceptance](mvp-12-acceptance.md) — automated gate and clean-Windows manual evidence
