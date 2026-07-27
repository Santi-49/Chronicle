# Documentation

## Start Here

- [Whole-Project Overview](PROJECT_OVERVIEW.md) — plain-language product, architecture,
  contracts, branch workflow, glossary, and reading guide for every team member
- [Getting Started](getting-started.md) — setup, commands, testing, packaging, control plane,
  and the contributor working agreement
- [Project Status](../PROJECT_STATUS.md) — current stage, component readiness, blockers,
  decisions, milestones, and immediate next actions
- [MVP Task Board](../TODO.md) — claimable tasks with dependencies, file boundaries,
  contracts, acceptance checks, and human decisions

## Product and Positioning

- [Challenge Fit](challenge-fit.md) — the judging case: problem, differentiation, competitive
  landscape, and evidence per criterion
- [AI Approach](ai-approach.md) — how the AI layer is designed, what leaves the device, and why
- [Team Spec](spec.md) — **read first**: tech stack, best practices, MVP functionality, risks
- [Desktop App Overview](desktop/overview.md) — UI pages, layout, startup flow, feature → page coverage
- [IBM Bob Usage Log](bob-log.md) — every PR adds a line; feeds the judged README section

## Architecture

- [System Overview](architecture/overview.md) — services, request flow, component map
- [Contracts](contracts.md) — operation behavior, input/output boundaries, and implementation specifications
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

## Operations and Compliance

- [Versions, CI, and Releases](releasing.md) — version rules, GitHub setup, promotion, and release runbook
- [Privacy Policy Record](privacy-policy.md) — lawful basis, retention schedule, and rights implementation
- [MVP-12 Acceptance](mvp-12-acceptance.md) — automated gate and clean-Windows manual evidence
- [Onboarding](onboarding.md) — Day-0 setup for new teammates
- [MCP Servers](mcp-servers.md) — AI agent tooling: Postgres, Playwright, Docker, Fetch, MarkItDown

## Implementation Plans

- [POST-07 — Install and Onboarding](post-07-install-onboarding-plan.md)
- [POST-08 — Windows Auto-Update](post-08-windows-auto-update-plan.md)
