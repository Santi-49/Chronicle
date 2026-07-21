# Chronicle Project Status

> Team dashboard · Updated 2026-07-21 · Submission deadline: **2026-07-31, 11:59 PM ET**

Start here at the beginning of a work session. Use [TODO.md](TODO.md) to claim work and
[Project Overview](docs/PROJECT_OVERVIEW.md) if you are new to Chronicle.

## Current stage

**MVP build in progress: capture, IPC, AI, and the live renderer are connected. Next:
restore, hybrid search, and a repeatable end-to-end reliability pass.**

```text
Research       Documentation       Contracts        MVP build         Demo/submission
   ✓                 ✓                 ✓          ← WE ARE HERE            ○
```

The repository has a compiling Electron/React app and a pre-built optional backend. On the
current `feat/mvp-06-ui-wire` branch, the renderer consumes the secure `window.chronicle`
bridge and live SQLite data/events. Users can create and edit projects (tracked folders),
persist descriptions/icons/colors and file-selection rules, browse captured assets and
versions, configure encrypted per-provider BYOK keys, and inspect pending AI jobs. The main
process watches folders, stores deduplicated versions, and drains annotation/embedding jobs
through the local Python service. Restore and the hybrid-search engine remain unimplemented.

## Status at a glance

| Area | Status | What this means |
|---|---|---|
| Challenge research and product vision | Ready | The problem, audience, judging criteria, scope, and demo story are documented. |
| MVP specification | Ready | Required behavior and acceptance examples are in `docs/spec.md`. |
| Boundary contracts | Ready for implementation | IPC, AI I/O, watcher decisions, settings, and planned API/module formats are baselined. |
| Desktop scaffold | Merged (MVP-01) | Foundation dependencies installed and verified; native SQLite loads in Electron; tests run under Electron's Node. |
| Folder watcher | Merged (MVP-03) | Chokidar watching with the 2 s settle and C4 ignore rules, 14 tests. Manual demo-editor test pending until capture is wired to the UI. |
| Version storage | Merged (MVP-02 + MVP-04) | SQLite init + repositories, and content-addressed capture: stream hash, dedup by content, append-only versions, dimensions metadata, AI job enqueue. 38 tests. |
| Secure IPC bridge | Merged (MVP-05); renderer now consumes it | C1 handlers, native folder picker, watcher→capture wiring, `chronicle://` image serving, encrypted BYOK storage, status/events, and input validation are implemented and tested. MVP-06 wired the renderer onto the bridge. |
| AI summaries | Merged (MVP-09) | The Python AI service lives in `services/ai/` (package `chronicle_ai`, FastAPI + LangChain, 41 tests); the Electron queue worker, generated C3 client, and process lifecycle stay in `apps/desktop/src/main/ai/`. Non-retryable (4xx) failures fail fast instead of retrying three times. Controlled Gemini first-version, diff, and 3,072-dimension embedding calls passed through the real worker/service/SQLite flow. The sidecar is not yet bundled for an installed build. |
| Shell, onboarding, settings | Complete on feature branch (MVP-06) | Renderer wired to live C1 via `src/renderer/src/lib/{bridge,useChronicle,aiCatalog}.ts` — no more `demoData.ts`. Status bar and pending-jobs screen, native folder scan/selection, project create/edit (name, description, icon, color, file types, ignored files), and curated Google/Anthropic/OpenAI/Bedrock settings with per-provider encrypted BYOK are implemented. Automated verification is green; manual Windows launch smoke remains. |
| Timeline and search UI | Rendering live data | Home, Projects/Project, Timeline, Version Details, and Search now render live C1 queries/events and real thumbnails (wired with MVP-06). Restore/search backends still reject (MVP-07/MVP-10), surfaced as clear "coming soon" states. |
| Restore and search engines | Not implemented end to end | Restore/save-copy and hybrid-search IPC handlers reject as not implemented (MVP-07/MVP-10); the UI is already wired to call them. |
| Backend control plane | Base auth/RBAC ready | Chronicle telemetry/config/gateway additions are low priority or stretch and must not delay the MVP. |
| Landing page | Existing optional page | Not part of the MVP; do not spend time here before the desktop app works. |
| Demo and submission | Demo pack implemented on feature branch | Three committed, generated image histories and a git-ignored watched workspace are documented in `demo-assets/`; video, final README evidence, team approval, and SkillsBuild completion remain outstanding. |

## Current contract baseline

A contract says what an operation does and what data goes in and comes out. It does not
decide the prompt, algorithm, provider, storage layout, tools, or internal classes.

| Boundary | Source of truth | Change rule |
|---|---|---|
| React renderer ↔ Electron main process | `apps/desktop/src/shared/ipc.ts` | Treat as stable. Propose contract changes separately before changing handlers or UI assumptions. |
| App ↔ AI functionality | Moving to the local AI service's OpenAPI + `packages/contracts/ai/output.schema.json` (decision 2026-07-19); `interface.ts` documents the shapes until then | Keep operation behavior and output shape stable; prompts and orchestration remain implementation-owned. |
| Filesystem candidate ↔ watcher | `apps/desktop/src/main/watcher/rules.ts` | Preserve supported formats, size cap, settle guarantee, inputs, outputs, and rejection reasons. |
| Shared settings | `apps/desktop/src/shared/settings.ts` | Never expose API keys or auth tokens through renderer-readable settings. |
| App ↔ control-plane API | `packages/contracts/api/PLANNED.md` | Low priority. Replace planned documentation with generated OpenAPI types when implemented. |
| Backend ↔ optional gateway module | `packages/contracts/module/interface.py` | Stretch only. Do not expand it before gateway research starts. |

The SQLite DDL in `apps/desktop/src/main/db/schema.sql` is an implementation specification,
not a public contract. Change it carefully through migrations once released.

## Immediate next actions

1. Review and merge `feat/mvp-06-ui-wire` into `dev` after the manual Windows launch and
   demo-editor smoke; retain the documented C1 contract changes.
2. Implement restore/save-copy (`MVP-07`) and hybrid search (`MVP-10`), then close the
   remaining UI acceptance work in `MVP-08`/`MVP-11`.
3. Run the full `MVP-12` journey repeatedly using `demo-assets/workspace/`, including
   offline queue, retry, restart, deleted-source, and 50 MB skip cases.
4. Decide and record the final demo provider/model/budget and approve the generated demo
   assets for public distribution.
5. Team lead fills in names/task ownership and confirms branch protection; every team member
   completes the required IBM SkillsBuild activity before July 25.

## Open decisions and risks

| Decision or risk | Owner | Needed by | Current action |
|---|---|---|---|
| MVP-09 packaging | MVP-09 / MVP-12 owner | Before MVP-12 | Live provider acceptance passed and the service is now in `services/ai/`. Still required for an installed build: bundle the Python sidecar and its provider dependency into the packaged app; this does not block the development-mode MVP flow. |
| Team roster and task ownership | Team lead | Now | Fill `docs/challenge/CONSTRAINTS.md` and TODO owners. |
| `dev` branch protection | Team lead | Before further implementation PRs | `dev` exists; confirm review/required-check protections for `dev` and `main`. |
| Demo AI provider/model and budget | Unassigned | Before `MVP-12` | Gemini passed controlled live acceptance and is the configured default; formally approve provider, retention/cost assumptions, and budget. |
| Visual QA against real data | UI owner | Before merging MVP-06 | Run the feature branch against captured demo assets and check empty/pending/failed/loading states. |
| Demo asset approval | Demo owner | Before `DEMO-01` closes | Generated logo/banner/product histories exist; review public-distribution suitability and expected annotation/search outcomes. |
| Watcher behavior in the real demo editor | Watcher owner | Before `MVP-12` | Test actual save, temp-file, and rename behavior on the Windows demo machine. |
| Native `better-sqlite3` setup on Windows | Foundation/database owners | During `MVP-01` | Verify Electron rebuild and document any required tools. |
| SkillsBuild completion for every member | Each member | By July 25 | Record completion outside the repository as agreed by the team. |

## Milestones

| Date | Target | Status |
|---|---|---|
| July 18 | Documentation, boundary contracts, implementation plan | On track / substantially complete |
| July 20 | Team ownership, demo assets, provider/design decisions | Late: assets implemented; ownership and final provider approval still missing |
| July 27 | MVP feature complete | In progress |
| July 30 | Video, README evidence, SkillsBuild, rehearsal | Not started |
| July 31 | Public repository and final submission | Not started |

## How to update this file

- Update it when a task is merged into `dev`, not merely when code exists on a feature branch.
- Link evidence such as tests, screenshots, or the relevant PR in the status note when possible.
- Do not report percentages without measurable acceptance criteria.
- Move completed implementation details out of this dashboard and into the relevant technical docs.
