# Chronicle Project Status

> Team dashboard · Updated 2026-07-21 · Submission deadline: **2026-07-31, 11:59 PM ET**

Start here at the beginning of a work session. Use [TODO.md](TODO.md) to claim work and
[Project Overview](docs/PROJECT_OVERVIEW.md) if you are new to Chronicle.

## Current stage

**MVP build in progress: capture, IPC, AI, restore, hybrid search, and the live renderer are connected.
Next: a repeatable end-to-end reliability and packaging pass.**

```text
Research       Documentation       Contracts        MVP build         Demo/submission
   ✓                 ✓                 ✓          ← WE ARE HERE            ○
```

The repository has a compiling Electron/React app and a pre-built optional backend. On
`dev`, the renderer consumes the secure `window.chronicle`
bridge and live SQLite data/events. Users can create and edit projects (tracked folders),
persist descriptions/icons/colors and file-selection rules, browse captured assets and
versions, configure encrypted per-provider BYOK keys, and inspect pending AI jobs. The main
process watches folders, stores deduplicated versions, drains annotation/embedding jobs through
the local Python service, restores prior versions append-only, and runs hybrid history search.

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
| AI summaries | Merged (MVP-09); packaged in MVP-12; POST-01 complete | The Python AI service lives in `services/ai/` (package `chronicle_ai`, FastAPI + LangChain); Electron owns its queue/client/lifecycle. Windows x64 and macOS Apple Silicon packaging include a self-contained, health-smoked Gemini/OpenAI/Anthropic sidecar and prompt, so installed users need no Python. The macOS CI build still needs its first hosted-run validation. Bedrock is excluded because its multi-field AWS credentials do not fit the current per-provider single-key contract. `POST-01`: explicit `format` enum (`"png"\|"jpg"\|"jpeg"`) now flows from the file path through the Electron worker, C3 contract, generated types, and Python schemas — both `ImageInput` and `AnnotateRequest` require it; 48 Python tests + typecheck green. |
| Shell, onboarding, settings | Merged (MVP-06) | Renderer wired to live C1 via `src/renderer/src/lib/{bridge,useChronicle,aiCatalog}.ts`. Status/queue UI, folder selection, project create/edit, and curated AI settings are implemented. Both AI selectors require a saved per-provider key; changed models are live-validated before persistence, rejected changes roll back with friendly feedback, and Google provider aliases migrate to `google_genai`. Typecheck, 118 desktop tests, and build are green. |
| Assets, Timeline, Version Details | Complete (MVP-08) | Live C1 queries/events and real thumbnails; keyboard timeline traversal; explicit pending/failed/restore states; retry feedback; missing-source badges; completed restore/save-copy controls; and a typed-safeguard reset that turns the latest snapshot into a freshly annotated v1. |
| Restore engine | Complete (MVP-07) | Selected library bytes overwrite the original path and append a provenance-marked version with no AI job. A missing original folder switches the UI to a native Save a copy dialog. Acceptance covers v2→v6, missing-folder fallback, cancellation, and validation. |
| Search UI and engine | Complete (MVP-10 and MVP-11) | FTS5 keyword and provider/model-scoped cosine semantic search return live version results and degrade to keyword-only when AI is unavailable. Embedding configuration changes queue deduplicated reindex jobs over existing annotation text, and Search explains live indexing, offline, and AI-setup states. |
| Backend control plane | Base auth/RBAC ready | Chronicle telemetry/config/gateway additions are low priority or stretch and must not delay the MVP. |
| Landing page | Existing optional page | Not part of the MVP; do not spend time here before the desktop app works. |
| Demo and submission | Demo pack merged (DEMO-01) | Three approved, generated image histories and a git-ignored watched workspace are documented in `demo-assets/`; video, final README evidence, and SkillsBuild completion remain outstanding. |

## Current contract baseline

A contract says what an operation does and what data goes in and comes out. It does not
decide the prompt, algorithm, provider, storage layout, tools, or internal classes.

| Boundary | Source of truth | Change rule |
|---|---|---|
| React renderer ↔ Electron main process | `apps/desktop/src/shared/ipc.ts` | Treat as stable. Propose contract changes separately before changing handlers or UI assumptions. |
| App ↔ AI functionality | Local AI service OpenAPI + `packages/contracts/ai/output.schema.json`, with generated TypeScript client types | Keep annotation, embedding, and provider/model validation behavior stable; prompts and orchestration remain implementation-owned. |
| Filesystem candidate ↔ watcher | `apps/desktop/src/main/watcher/rules.ts` | Preserve supported formats, size cap, settle guarantee, inputs, outputs, and rejection reasons. |
| Shared settings | `apps/desktop/src/shared/settings.ts` | Never expose API keys or auth tokens through renderer-readable settings. |
| App ↔ control-plane API | `packages/contracts/api/PLANNED.md` | Low priority. Replace planned documentation with generated OpenAPI types when implemented. |
| Backend ↔ optional gateway module | `packages/contracts/module/interface.py` | Stretch only. Do not expand it before gateway research starts. |

The SQLite DDL in `apps/desktop/src/main/db/schema.sql` is an implementation specification,
not a public contract. Change it carefully through migrations once released.

## Immediate next actions

1. Complete `docs/mvp-12-acceptance.md` three times on the clean Windows demo machine using
   the generated installer and `demo-assets/workspace/`, including offline queue, retry,
   restart, deleted-source, 50 MB skip, and the actual demo editor.
2. Decide and record the final demo provider/model/budget. VALIDATE-01 validated the Gemini
   defaults live and flagged two team sign-off items (moving `gemini-flash-latest` alias vs. a
   pinned Flash ID; provider/retention/cost/budget approval) — see Open decisions.
3. Team lead fills in names/task ownership and confirms branch protection; every team member
   completes the required IBM SkillsBuild activity before July 25.

## Open decisions and risks

| Decision or risk | Owner | Needed by | Current action |
|---|---|---|---|
| MVP-12 clean-machine acceptance | MVP-12 owner | Before marking MVP-12 complete | The automated MVP-12 gate passed three consecutive runs (desktop 138 passed/1 skipped, AI 48 passed, API 41 passed per run). The current 139.7 MB unsigned NSIS installer contains a 30.0 MB Python 3.12 sidecar; frozen imports for Gemini/OpenAI/Anthropic and `/health` version `0.1.0` pass. The three-pass manual journey/real-editor record is still required. |
| Team roster and task ownership | Team lead | Now | Fill `docs/challenge/CONSTRAINTS.md` and TODO owners. |
| `main` automation/protection | Team lead | Before merging MVP-12 | Configure `RELEASE_PLEASE_TOKEN`, allow Action-created PRs and auto-merge, require the three **Main PR CI** jobs only for PRs targeting `main`, and keep direct pushes disabled. Same-repo `dev → main` and labeled Release Please PRs auto-merge only after protected checks; the temporary release branch is deleted. Set required approvals to 0 for zero-touch solo releases, or retain approval as an intentional manual gate. `dev` has no required CI by team decision. |
| Demo AI provider/model and budget | Unassigned | Before `MVP-12` | VALIDATE-01 (2026-07-21) re-probed the defaults live: `gemini-flash-latest` (annotation) and `gemini-embedding-001` (3,072-dim embeddings) both work end-to-end with graceful error paths. Removed the retired `text-embedding-004` catalog entry (live 404). **Team sign-off still needed on:** (a) keeping the moving `gemini-flash-latest` alias vs. pinning a dated Flash ID for the demo, and (b) provider/retention/approx-cost/budget assumptions. |
| Watcher behavior in the real demo editor | Watcher owner | Before `MVP-12` | Test actual save, temp-file, and rename behavior on the Windows demo machine. |
| Native `better-sqlite3` setup on Windows | Foundation/database owners | During `MVP-01` | Verify Electron rebuild and document any required tools. |
| SkillsBuild completion for every member | Each member | By July 25 | Record completion outside the repository as agreed by the team. |

## Milestones

| Date | Target | Status |
|---|---|---|
| July 18 | Documentation, boundary contracts, implementation plan | On track / substantially complete |
| July 20 | Team ownership, demo assets, provider/design decisions | Partially complete: assets and design resolved; ownership and final provider approval still missing |
| July 27 | MVP feature complete | In progress |
| July 30 | Video, README evidence, SkillsBuild, rehearsal | Not started |
| July 31 | Public repository and final submission | Not started |

## How to update this file

- Update it when a task is merged into `dev`, not merely when code exists on a feature branch.
- Link evidence such as tests, screenshots, or the relevant PR in the status note when possible.
- Do not report percentages without measurable acceptance criteria.
- Move completed implementation details out of this dashboard and into the relevant technical docs.
