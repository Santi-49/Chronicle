# Chronicle Project Status

> Team dashboard · Updated 2026-07-17 · Submission deadline: **2026-07-31, 11:59 PM ET**

Start here at the beginning of a work session. Use [TODO.md](TODO.md) to claim work and
[Project Overview](docs/PROJECT_OVERVIEW.md) if you are new to Chronicle.

## Current stage

**Planning and contracts are complete. MVP implementation is the next stage.**

```text
Research       Documentation       Contracts        MVP build         Demo/submission
   ✓                 ✓                 ✓          ← WE ARE HERE            ○
```

The repository has a working Electron/React shell, complete renderer screen skeletons, and a
pre-built optional backend. The screens currently use typed demo data; watcher, storage, AI,
restore, and search-engine integrations have not yet been implemented.

## Status at a glance

| Area | Status | What this means |
|---|---|---|
| Challenge research and product vision | Ready | The problem, audience, judging criteria, scope, and demo story are documented. |
| MVP specification | Ready | Required behavior and acceptance examples are in `docs/spec.md`. |
| Boundary contracts | Ready for implementation | IPC, AI I/O, watcher decisions, settings, and planned API/module formats are baselined. |
| Desktop scaffold | Renderer skeleton ready | Electron opens the full welcome/workspace shell with dark/light themes and typed screen navigation; native feature dependencies are still missing. |
| Folder watcher | Contract only | Rules are defined; Chokidar integration and real-editor testing are not implemented. |
| Version storage | Schema draft only | SQLite schema exists; database initialization, repositories, hashing, and file storage are not implemented. |
| AI summaries | Contract and prompt asset only | No LangChain provider integration, job runner, or encrypted-key handling exists yet. |
| Timeline, restore, and search | UI skeleton ready | Assets, Timeline, Version Details, Search, and Settings flows render with demo data; IPC/database/search-engine behavior remains to be connected. |
| Backend control plane | Base auth/RBAC ready | Chronicle telemetry/config/gateway additions are low priority or stretch and must not delay the MVP. |
| Landing page | Existing optional page | Not part of the MVP; do not spend time here before the desktop app works. |
| Demo and submission | Not started | Demo assets, video, final README evidence, and SkillsBuild completion remain outstanding. |

## Current contract baseline

A contract says what an operation does and what data goes in and comes out. It does not
decide the prompt, algorithm, provider, storage layout, tools, or internal classes.

| Boundary | Source of truth | Change rule |
|---|---|---|
| React renderer ↔ Electron main process | `apps/desktop/src/shared/ipc.ts` | Treat as stable. Propose contract changes separately before changing handlers or UI assumptions. |
| App ↔ AI functionality | `packages/contracts/ai/interface.ts` and `output.schema.json` | Keep operation behavior and output shape stable; prompts and orchestration remain implementation-owned. |
| Filesystem candidate ↔ watcher | `apps/desktop/src/main/watcher/rules.ts` | Preserve supported formats, size cap, settle guarantee, inputs, outputs, and rejection reasons. |
| Shared settings | `apps/desktop/src/shared/settings.ts` | Never expose API keys or auth tokens through renderer-readable settings. |
| App ↔ control-plane API | `packages/contracts/api/PLANNED.md` | Low priority. Replace planned documentation with generated OpenAPI types when implemented. |
| Backend ↔ optional gateway module | `packages/contracts/module/interface.py` | Stretch only. Do not expand it before gateway research starts. |

The SQLite DDL in `apps/desktop/src/main/db/schema.sql` is an implementation specification,
not a public contract. Change it carefully through migrations once released.

## Immediate next actions

1. Team lead creates and protects the `dev` integration branch.
2. Team fills in names and task ownership in [TODO.md](TODO.md).
3. Complete `MVP-01` desktop foundation before feature branches depend on missing packages.
4. Run `MVP-02`, `MVP-03`, and UI preparation in parallel after the foundation is merged.
5. Decide the demo AI provider and demo asset owner this week; the visual direction is now recorded in `docs/challenge/CONSTRAINTS.md`.
6. Every team member completes the required IBM SkillsBuild activity before July 25.

## Open decisions and risks

| Decision or risk | Owner | Needed by | Current action |
|---|---|---|---|
| Team roster and task ownership | Team lead | Now | Fill `docs/challenge/CONSTRAINTS.md` and TODO owners. |
| `dev` branch and repository protection | Team lead | Before implementation PRs | Create `dev`; require review for `dev` and `main`. |
| Demo AI provider/model and budget | Unassigned | Before `MVP-07` | Test API quality, cost, privacy, and LangChain structured output. |
| Visual QA against real data | UI owner | During renderer integration | The dark-first flat direction is recorded; replace demo content with real IPC data without changing the shell hierarchy. |
| Demo asset pack and scripted edits | Unassigned | By July 20 | Create controlled logo/banner/product image versions. |
| Watcher behavior in the real demo editor | Watcher owner | During `MVP-03` | Test actual save, temp-file, and rename behavior early. |
| Native `better-sqlite3` setup on Windows | Foundation/database owners | During `MVP-01` | Verify Electron rebuild and document any required tools. |
| SkillsBuild completion for every member | Each member | By July 25 | Record completion outside the repository as agreed by the team. |

## Milestones

| Date | Target | Status |
|---|---|---|
| July 18 | Documentation, boundary contracts, implementation plan | On track / substantially complete |
| July 20 | Team ownership, demo assets, provider/design decisions | Open |
| July 27 | MVP feature complete | Not started |
| July 30 | Video, README evidence, SkillsBuild, rehearsal | Not started |
| July 31 | Public repository and final submission | Not started |

## How to update this file

- Update it when a task is merged into `dev`, not merely when code exists on a feature branch.
- Link evidence such as tests, screenshots, or the relevant PR in the status note when possible.
- Do not report percentages without measurable acceptance criteria.
- Move completed implementation details out of this dashboard and into the relevant technical docs.
