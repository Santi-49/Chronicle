# Chronicle MVP Task Board

> This is the executable team plan. Claim one task, stay inside its file boundary, and
> merge it into `dev` only after its acceptance checks pass.

Status: `[ ]` not started · `[~]` in progress · `[x]` merged into `dev` · `[!]` blocked

## Required reading before implementing (humans and AI agents)

Do not start any task below without this context. AI assistants especially: these files
are the source of truth for scope, contracts, and hard rules — code that contradicts them
gets rejected in review even if it works. (Claude Code loads most of them automatically
via `CLAUDE.md`; other tools such as IBM Bob must be pointed at them explicitly.)

**Always read, in this order:**

| # | File | What it gives you |
|---|------|-------------------|
| 1 | `docs/challenge/CHALLENGE.md` | Hackathon rules, judging criteria, submission requirements, deadline |
| 2 | `docs/challenge/VISION.md` | What Chronicle is, selling point, key features, demo script |
| 3 | `docs/challenge/CONSTRAINTS.md` | Scope decisions, priorities, performance targets, design language, timeline |
| 4 | `docs/spec.md` | Tech stack (binding), MVP feature specs F1–F10 with "done when" tests, ways of working |
| 5 | `docs/contracts.md` | Contract map C1–C7 — which boundaries are fixed and where each lives |
| 6 | `PROJECT_STATUS.md` | Current stage, blockers, decisions already made |

**Read when relevant to your task:**

| File | Read before |
|------|-------------|
| `docs/challenge/RESEARCH.md` | Any judging-facing, AI-provider, or design decision (decisions log lives here) |
| `docs/desktop/overview.md` | Any renderer/UI work — pages, layout, startup flow |
| `docs/PROJECT_OVERVIEW.md` | Your first task in this repo (plain-language orientation) |
| `apps/desktop/src/shared/ipc.ts` | Anything touching the renderer↔main boundary (C1 — do not edit without an approved contract PR) |
| `apps/desktop/src/shared/settings.ts` | Anything touching settings or secrets (C5) |
| `apps/desktop/src/main/watcher/rules.ts` | Watcher work (C4) |
| `packages/contracts/ai/` | AI annotation/embedding work (C3) |
| `apps/desktop/README.md` | Running the app — commands, native-module rebuilds, where app data lives |
| `packages/prompts/` | Any prompt content (prompts live here only, never inline in code) |

## Before claiming a task

1. Write your name beside **Owner**. One primary owner avoids duplicate work.
2. Read the task's references and contracts completely.
3. Create a branch from the latest `dev`: `feat/mvp-XX-short-name`.
4. Edit only the listed files. Ask the affected owner before crossing a boundary.
5. If a contract must change, stop and propose that change separately before continuing.
6. Add tests, update relevant documentation, and add one line to `docs/bob-log.md`.
7. Open a PR into `dev`; never push feature work directly to `dev` or `main`.
8. **AI agents: STOP before merging.** Implement, test, and commit on the feature branch,
   then hand back and wait. Never merge into `dev` or `main`, push, or open/merge a PR
   unless a human explicitly instructs it in the current session — a past "merge it"
   never carries over to the next task.

## Shared rules every task must uphold

- Chronicle's version library and SQLite data stay on-device.
- AI inference is API-based through LangChain (Python). AI features are implemented in the
  **local AI service** (`services/ai/`, FastAPI, loopback-only — not the control plane),
  called by the Electron main process. BYOK credentials are encrypted locally and never
  exposed to the renderer or sent to Chronicle's backend.
- AI and network work is asynchronous; the UI must never wait on it.
- Prefer library-native classes and functions. Do not add a custom abstraction until a
  concrete limitation has been researched and documented.
- Prompt content lives only in `packages/prompts/*.md` with YAML front matter.
- The optional backend, gateway, admin page, installer, and landing page cannot delay MVP.
- Do not silently change a contract, product scope, privacy promise, or acceptance test.

## Phase 0 — Team setup

### [ ] TEAM-01 — Establish the shared Git workflow

**Owner:** Unassigned  
**Depends on:** Nothing  
**Goal:** Give the team a safe place to integrate work without destabilizing `main`.

**May edit:** Repository hosting settings; this task normally needs no product-code edits.  
**Must not edit:** Feature code or contracts.

**Actions:**

- Create `dev` from the current reviewed `main` commit.
- Protect `main` and `dev` from direct pushes if the hosting plan permits it.
- Require at least one review and passing checks before merge.
- Confirm branch names: `feat/...`, `fix/...`, `docs/...`.

**Docs to update:** record the agreed branch/protection rules in `PROJECT_STATUS.md`;
correct `docs/spec.md` §6.2 if the workflow deviates from it.

**Done when:** Every member can branch from `dev`, push a feature branch, and target a PR
back to `dev`. `main` remains the stable submission branch.

### [ ] TEAM-02 — Assign people and compliance work

**Owner:** Unassigned  
**Depends on:** Nothing

**May edit:** `TODO.md`, `PROJECT_STATUS.md`, `docs/challenge/CONSTRAINTS.md`.  
**Must not edit:** Product behavior while assigning ownership.

**Actions:**

- Fill the team roster and assign every MVP task below.
- Name one integration/release owner and one demo/submission owner.
- Confirm every member's SkillsBuild activity and internal completion evidence.

**Docs to update:** roster table in `docs/challenge/CONSTRAINTS.md`; Owner lines in this
file; stage/blockers in `PROJECT_STATUS.md`.

**Done when:** No critical task or compliance requirement is unowned.

## Phase 1 — Desktop foundation

### [x] MVP-01 — Install and verify the desktop foundation

**Owner:** Santi R (merged into `dev` via `feat/mvp-02-sqlite-repositories`)  
**Depends on:** TEAM-01  
**Goal:** Make all agreed desktop libraries available and establish a testable app skeleton.

**May edit:**

- `apps/desktop/package.json` and its lockfile
- `apps/desktop/electron.vite.config.ts`
- `apps/desktop/tsconfig*.json`
- `apps/desktop/src/main/index.ts`
- New setup/test configuration files inside `apps/desktop/`
- `apps/desktop/README.md`

**Must not edit:** `src/shared/ipc.ts`, `src/shared/settings.ts`, watcher rules, AI contracts,
prompt content, backend services.

**Required functionality:** Add the agreed foundation dependencies only:
`better-sqlite3`, Chokidar, Tailwind, and Vitest. Establish the app data/library paths,
secure BrowserWindow defaults, and a minimal test command. AI/provider packages remain
owned by MVP-09 after its research step.

**Contracts upheld:** C1 security boundary; C5 secrets never enter renderer-visible settings.

**Docs to update:** `apps/desktop/README.md` (commands, setup, native-module notes) and
one line in `docs/bob-log.md`.

**Done when:** Clean install, `npm run dev`, `npm run typecheck`, `npm test`, and
`npm run build` work on the primary Windows machine. Native SQLite loading is verified.

> Completed via `feat/mvp-02-sqlite-repositories` (renderer shell was already built):
> `better-sqlite3`, Chokidar, Tailwind 4 (wired but inert until a stylesheet imports it),
> and Vitest installed at exact versions; `npm test` runs under Electron's Node via
> `ELECTRON_RUN_AS_NODE` after `electron-rebuild` in postinstall; native SQLite loading
> in Electron 43 verified; explicit secure BrowserWindow defaults; app data/library
> paths established and the database opens on startup. See `apps/desktop/README.md`.

## Phase 2 — Local capture core

### [x] MVP-02 — Implement SQLite initialization and repositories

**Owner:** Santi R (merged into `dev` via `feat/mvp-02-sqlite-repositories`)  
**Depends on:** MVP-01  
**Goal:** Persist folders, assets, versions, annotations, embeddings, jobs, and settings.

**May edit:** `apps/desktop/src/main/db/**` and DB-focused tests.  
**Must not edit:** Renderer, preload, watcher, AI implementation, `src/shared/ipc.ts`.

**Required functionality:** Open the database in the Electron user-data directory, apply
the schema safely, use transactions for multi-record changes, and expose small repository
functions needed by versioning/search. Keep file bytes out of SQLite.

**Contracts upheld:** Return domain data compatible with C1 view shapes when composed by
handlers. Treat `schema.sql` as implementation-owned; document any migration decision.

**Docs to update:** `apps/desktop/src/main/db/README.md` (module layout, migration
decision) and one line in `docs/bob-log.md`.

**Done when:** Tests cover first startup, repeat startup, uniqueness, append-only version
numbers, foreign keys, transaction rollback, and JSON/vector round trips.

### [x] MVP-03 — Implement and test folder watching

**Owner:** Santi R (merged into `dev` via `feat/mvp-03-folder-watcher`)  
**Depends on:** MVP-01  
**Goal:** Produce one settled capture candidate for each real PNG/JPG save.

**May edit:** `apps/desktop/src/main/watcher/**` except contract changes to `rules.ts`;
watcher-focused tests.  
**Must not edit:** Database, renderer, AI, IPC contract.

**Required functionality:** Recursive Chokidar watching, startup/shutdown of tracked folders,
settling around two seconds, hidden/temp-file rejection, case-insensitive supported formats,
50 MB rejection, and clear callbacks for accepted/skipped candidates.

**Contracts upheld:** C4 `WatchCandidate`, `WatchDecision`, supported extensions, size cap,
settle guarantee, and rejection reasons.

**Docs to update:** `apps/desktop/src/main/watcher/README.md` (behavior, ignore rules,
settle approach); log demo-editor test findings in `docs/challenge/RESEARCH.md`; one line
in `docs/bob-log.md`.

**Done when:** Automated tests pass and a manual test in the actual demo editor produces one
candidate per save, including temp-write/atomic-rename behavior.

> Done so far: `evaluate.ts` (pure C4 decision) + `watcher.ts` (chokidar lifecycle:
> per-folder watch/unwatch/close, 2 s settle via `awaitWriteFinish`, atomic-rename
> handling, hidden-dir exclusion, initial-scan capture) + 14 tests incl. real-filesystem
> integration; `require()` of ESM chokidar verified under Electron 43/Node 24. See
> `apps/desktop/src/main/watcher/README.md`. Still open (tracked in RESEARCH.md, folds
> into MVP-04/MVP-12 verification): manual save test in the actual demo editor once
> capture makes candidates visible.

### [x] MVP-04 — Implement content-addressed version capture

**Owner:** Santi R (merged into `dev` via `feat/mvp-04-version-capture`)  
**Depends on:** MVP-02, MVP-03  
**Goal:** Turn accepted files into deduplicated, append-only asset versions.

**May edit:** `apps/desktop/src/main/versioning/**`; add narrowly required DB repository
functions through coordination with the MVP-02 owner.  
**Must not edit:** Renderer, AI contract, watcher contract, control plane.

**Required functionality:** Stream SHA-256 hashing off the UI path, skip identical latest
content, copy bytes to `library/<hash-prefix>/<hash>`, record dimensions/size/timestamps,
create assets by path, mark missing files, and enqueue AI work without awaiting it.

**Contracts upheld:** F3 behavior in `docs/spec.md`; C1 version/asset fields; local storage
and append-only history guarantees.

**Docs to update:** `apps/desktop/src/main/versioning/README.md` (capture rules as built);
`apps/desktop/README.md` "Where app data lives" if the library layout changes; one line in
`docs/bob-log.md`.

**Done when:** Three changed saves create exactly three versions; identical bytes create no
new version; duplicate content is stored once; 50 MB and missing-file cases are handled.

> Done: `capture.ts` (F3 pipeline: snapshot+hash in one streamed pass → dedup vs. latest
> version → append version + enqueue `ai_annotation` job in one transaction) + `library.ts`
> (content-addressed store, temp-write + rename) + `dimensions.ts` (PNG/JPEG header parse,
> no new dependency) + 15 real-filesystem tests covering all acceptance checks. No DB
> repository changes were needed — MVP-02's functions sufficed. See
> `apps/desktop/src/main/versioning/README.md`. The MVP-03 manual demo-editor test remains
> open until watcher→capture wiring lands (MVP-05/MVP-12).

### [x] MVP-05 — Implement the secure IPC bridge and handlers

**Owner:** Santi R (implemented on `feat/mvp-05-ipc-bridge`; merged into `dev` as `aa1f136`)  
**Depends on:** MVP-02; coordinate with MVP-03/MVP-04  
**Goal:** Let React use desktop functionality without direct Node/filesystem access.

> Implemented on the branch (75/75 tests, typecheck + build + boot verified):
> `src/main/ipc/` — `services.ts` (every C1 method + validation, Electron-free, tested),
> `register.ts` (ipcMain handlers with sender check, `chronicle://image/<hash>` protocol,
> native folder picker, event broadcast), `secrets.ts` (safeStorage BYOK key, write-only),
> `channels.ts` (compile-time-exhaustive channel map shared with preload), plus the
> watcher → capture → events wiring MVP-03/04 left open. Preload now exposes exactly
> `ChronicleBridge`. Pending inside C1 (handlers reject clearly, see
> `apps/desktop/README.md`): restore/save-copy (MVP-07), search (MVP-10), register/login (F1).

**May edit:** `apps/desktop/src/preload/index.ts`, new `apps/desktop/src/main/ipc/**`, and
IPC-focused tests.  
**Must not edit:** `apps/desktop/src/shared/ipc.ts` unless a separate contract-change PR is approved.

**Required functionality:** Expose only `ChronicleBridge`, validate renderer inputs, register
and unregister main handlers, forward typed events, and return safe URLs/metadata rather than
raw files or secret values.

**Contracts upheld:** Every C1 method, result, event, unsubscribe behavior, and secret boundary.

**Docs to update:** note which C1 methods/events are implemented vs. pending in
`apps/desktop/README.md`; update `docs/desktop/overview.md` if wiring changes any surfaced
behavior; one line in `docs/bob-log.md`.

**Done when:** Contract tests show every implemented handler matches C1; the renderer cannot
access Node APIs, filesystem paths outside returned metadata, API keys, or auth tokens.

## Phase 3 — User interface and restore

### [~] MVP-06 — Build the application shell, onboarding, and settings

**Owner:** Santi R (UI built on `dev`; IPC wiring blocked on MVP-05)  
**Depends on:** MVP-01, MVP-05  
**Goal:** Provide understandable navigation and let users start tracking folders/configure AI.

**May edit:** Renderer app shell, navigation, onboarding, settings pages/components/styles
under `apps/desktop/src/renderer/src/**`.  
**Must not edit:** Main-process implementations or shared contracts.

**Required functionality:** Continue-local startup, Assets/Search/Settings navigation, status
bar, empty state, tracked-folder controls, AI provider/model/key controls, and accessible
keyboard/focus behavior. Never read an API key back into the renderer.

**Contracts upheld:** C1 methods/events and C5 settings/security behavior.

**Docs to update:** `docs/desktop/overview.md` is the UI source of truth — update it in the
same PR as any screen/navigation change; one line in `docs/bob-log.md`.

**Done when:** A new user can launch, choose local mode, add a folder, understand AI setup,
and see watcher/job/connectivity status without assistance.

> Done (feature branch `feat/mvp-06-shell-onboarding-settings`, awaiting review/merge):
> app shell + status bar, welcome/onboarding, theme persistence, and Ctrl+K remain, and the
> whole renderer is now wired to the live C1 bridge (no more `demoData.ts`) via
> `src/renderer/src/lib/{bridge,useChronicle,aiCatalog}.ts`:
> - **Tracked folders / projects** — real `listFolders`/`pickFolder`/`addFolder`/`updateFolder`/
>   `removeFolder`; New Project uses the native picker + name/icon/color.
> - **AI settings** — predefined **Google · Anthropic · OpenAI · Bedrock** providers with a
>   curated quality/price model shortlist per task (change summaries vs. embeddings) and a
>   **Developer mode** toggle for free-text provider/model; encrypted BYOK key with saved/clear
>   state. Persisted via `updateSettings` + `setApiKey`; key never read back.
> - **Status bar** — live `getAppStatus` + `statusChanged` (watched folders, online, AI ready,
>   pending jobs).
> ✅ Contract-alignment resolved: C1 `TrackedFolder` extended to
> `{ id, path, addedAt, displayName, icon, color }` (schema migration + repositories + services
> + tests updated); `addFolder(path, meta?)`/`updateFolder(id, patch)`/`pickFolder()` added.
> Typecheck + 82 desktop tests + build all green.
> Remaining (human): manual launch/demo-editor smoke on Windows; the "Log in / Register"
> startup path stays F1 (low priority) coming-soon.

### [ ] MVP-07 — Implement restore and save-copy behavior

**Owner:** Unassigned  
**Depends on:** MVP-04, MVP-05  
**Goal:** Restore an old version without rewriting history.

**May edit:** New restore functions inside `apps/desktop/src/main/versioning/**`, corresponding
main IPC handlers, and restore tests. Coordinate before editing files owned by MVP-04/MVP-05.  
**Must not edit:** C1 restore result shape without approval.

**Required functionality:** Write selected bytes to the original path, capture the result as a
new version marked “Restored from version N,” suppress its AI job, and offer a native save-copy
dialog if the original folder is missing.

**Contracts upheld:** C1 `RestoreResult`; F6 append-only restore behavior.

**Docs to update:** `docs/desktop/overview.md` Version Details section (restore marked as
built, not planned); flag any F6 deviation in `docs/spec.md` instead of silently diverging;
one line in `docs/bob-log.md`.

**Done when:** Restoring v2 from v5 writes v2 bytes and creates v6; missing-folder save-copy works.

### [~] MVP-08 — Build Assets, Timeline, and Version Details pages

**Owner:** Santi R (UI built on `dev` against mock data; real-data wiring blocked on MVP-05)  
**Depends on:** MVP-05, MVP-06; usable mock data may be used earlier  
**Goal:** Make the complete version history understandable to a first-time user.

**May edit:** Dedicated renderer pages/components/tests for assets, timeline, version details,
previews, status chips, and restore controls.  
**Must not edit:** Main-process services or shared contracts.

**Contracts upheld:** C1 asset/version/detail shapes and events; page behavior in
`docs/desktop/overview.md`.

**Docs to update:** `docs/desktop/overview.md` pages 2–7 (remove the *planned* markers that
this task delivers); one line in `docs/bob-log.md`.

**Done when:** New captures appear without reload, keyboard navigation works, pending/failed
AI states are clear, and a new teammate can answer what changed between versions.

> Done: Home, Projects/Project, Timeline, and Version Details now render **live C1 data**
> (wired alongside MVP-06 on `feat/mvp-06-shell-onboarding-settings`): real thumbnails via
> `chronicle://`, live capture/annotation refresh from `versionCaptured`/`annotationUpdated`,
> and the Restore button calls `restoreVersion` (surfaces MVP-07's "coming soon" until that
> lands). Retry calls `retryAnnotation`. Remaining for MVP-08 sign-off: restore end-to-end
> (needs MVP-07) and a review of pending/failed AI-state coverage against real captures.

## Phase 4 — AI and search

### [x] MVP-09 — Research and implement API-based AI annotation (Python AI service)

**Owner:** Joel / team · implementation and live-provider acceptance complete
**Depends on:** MVP-01, MVP-02, MVP-04; MVP-05 for the status/events surface  
**Goal:** Produce structured summaries, changes, and tags asynchronously through LangChain (Python).

> Architecture decision (2026-07-19): AI features are developed **in Python** in a new
> **local AI service** — `services/ai/`, FastAPI + LangChain, listening only on `127.0.0.1`,
> started next to the app (no Docker; distinct from the `services/api/` control plane).
> The Electron main process keeps the queue worker and calls the service over local HTTP;
> C3's source of truth becomes the service's OpenAPI schema + `output.schema.json`, with
> generated TS client types.
>
> AI feature scope (decided 2026-07-19): the MVP service surface is exactly
> `POST /annotate` (two-image diff; `previous: null` → first-version description),
> `POST /embed-text` (version summaries+tags and search queries), and `GET /health`.
> The annotation output includes an optional nullable `confidence` (0–1). **Image
> embeddings and a history chatbot are roadmap, not MVP** — do not build `/embed-image`
> or `/chat` before every MVP task is done.

> ✅ **RESOLVED 2026-07-19** — the corrections below are applied: model-agnostic
> `init_chat_model`/`init_embeddings` engine, per-request BYOK key, FastAPI transport,
> Pydantic v2 with nullable `confidence`, and base64 `ImageInput`. The Python package
> now lives in `services/ai/` (package `chronicle_ai`); only the TS worker/client remain
> in `apps/desktop/src/main/ai/`. Kept here as the historical record.
>
> ⚠️ **NEW 2026-07-19 — COURSE CORRECTION for the `feat/mvp-09-python-ai` spike.**
> Read this before writing any MVP-09 code. The spike predates the decisions above and
> deviates from them; the merge on this branch kept its files but they must change:
>
> 1. **Provider-pinned engine** — `gemini_engine.py` hardcodes `ChatGoogleGenerativeAI`.
>    The spec (§2/§6.4) requires **model-agnostic LangChain defaults**: use the neutral
>    `init_chat_model` factory; provider, model, and key are per-request inputs. Gemini
>    may still be the *default demo provider* — as configuration, never as code.
> 2. **Key handling** — no `GEMINI_API_KEY` env var. The BYOK key arrives per request
>    from Electron `safeStorage` over `127.0.0.1` and is never persisted by the service.
> 3. **Transport** — the stdin/stdout CLI bridge described in the spike README is
>    **superseded** by the FastAPI service (`POST /annotate`). `cli.py` is an empty stub;
>    do not fill it in.
> 4. **Location** — the Python package moves from `apps/desktop/src/main/ai/` to
>    `services/ai/`; only the TS queue worker + generated HTTP client stay in Electron.
> 5. **Pydantic v1 idioms** — `@validator`, `min_items`/`max_items` break under
>    Pydantic v2, which FastAPI requires. Port to `field_validator`/`min_length` and add
>    the optional nullable `confidence` field from C3.
> 6. **Input shape** — the spike passes file paths; C3 `ImageInput` is base64+mediaType.
>    Confirm base64 when defining the OpenAPI schema (paths break gateway reuse, F9).
>
> Keep from the spike: `with_structured_output(VersionAnnotation)`, previous-then-current
> image ordering, the first-version mode, `schemas.py` validation intent, `image_loader.py`.
> The same table lives in `apps/desktop/src/main/ai/README.md` ("Transitional note").

**May edit:** new `services/ai/**` (FastAPI app, LangChain pipeline, pytest tests),
`apps/desktop/src/main/ai/**` (queue worker + generated-typed HTTP client),
AI tests/fixtures, prompt files under `packages/prompts/` when recording an intentional
experiment, and `packages/contracts/ai/**` only through the agreed C3 redefinition
(OpenAPI + schema).  
**Must not edit:** C3 operation functionality or output schema beyond that redefinition
without a separate approved change; the C1 contract; the control plane.

**Required functionality:** LangChain-native structured output where supported, prompt
loaded from the Markdown/YAML asset, provider called with the per-request BYOK key
(taken from Electron `safeStorage`, sent only over loopback, never persisted by the
service), output validated against the schema, status/output/provider/model/latency
persisted, safe retries, queued jobs resumed after outages, and a health check the app
surfaces in the status bar. A documented start script for the service.

**Contracts upheld:** C3 operation functionality and schema; C5 secret boundary; all AI work async.

**Docs to update:** a README in `services/ai/` (endpoints, run instructions) and
`apps/desktop/src/main/ai/README.md` (worker/client as built); provider
quality/cost/privacy findings in the `docs/challenge/RESEARCH.md` log; front-matter notes on
prompt experiments in `packages/prompts/`; one line in `docs/bob-log.md`.

**Done when:** First-version description and two-image diff work on demo fixtures through the
running service; invalid output, missing key, provider error, retry, offline queue, and
service-down behavior are tested. No local model is added.

> Accepted 2026-07-19 with Gemini: controlled first-version and two-image diff returned
> valid C3 annotations; `gemini-embedding-001` returned a 3,072-dimension vector; the
> opt-in live worker test verified sidecar health, annotation/embedding queues, generated
> C3 client calls, SQLite persistence, model identity, and an empty final queue. Provider-
> mocked tests retain coverage for invalid output, missing key, retry, offline, and
> service-down behavior.

### [ ] MVP-10 — Implement hybrid keyword and semantic search

**Owner:** Unassigned  
**Depends on:** MVP-02, MVP-09  
**Goal:** Find exact and meaning-related versions in one ranked list.

**May edit:** New `apps/desktop/src/main/search/**`, search-focused DB repository functions,
search IPC handlers, and search tests.  
**Must not edit:** C1/C3 contracts or UI outside the dedicated search page without coordination.

**Required functionality:** Maintain FTS data, create embeddings through C3, store model identity,
avoid comparing incompatible vectors, combine keyword/vector scores deterministically, and keep
keyword search available when provider APIs are offline.

**Contracts upheld:** C1 `SearchResult`; C3 `embedText`; F7 result is version-level.

**Docs to update:** a README in `apps/desktop/src/main/search/` (ranking formula, offline
behavior, model-identity rule); one line in `docs/bob-log.md`.

**Done when:** “version with the tagline” and “blue background” find the expected fixtures;
ranking, empty query, unavailable embeddings, and model changes are tested.

### [~] MVP-11 — Build the Search page

**Owner:** Santi R (UI built on `dev` against mock data; blocked on MVP-05/MVP-10)  
**Depends on:** MVP-06, MVP-10; mock results may be used earlier  
**Goal:** Present one simple search experience without exposing implementation modes.

**May edit:** Dedicated renderer search page/components/tests.  
**Must not edit:** Search engine, database, or contracts.

**Contracts upheld:** C1 search request/result shapes; offline-state UX in desktop overview.

**Docs to update:** `docs/desktop/overview.md` Search section (remove the *planned* offline
note once built); one line in `docs/bob-log.md`.

**Done when:** Keyboard search opens a result's version details and clearly explains when recent
semantic indexing is still pending.

> Done: Search screen with Ctrl+K now calls the real C1 `search` (debounced) and opens live
> version details; while MVP-10's engine is unbuilt the handler rejects, and the page shows a
> clear "search is warming up" state. Remaining for MVP-11 sign-off: real ranked results and
> the semantic-indexing-pending affordance once MVP-10 lands.

## Phase 5 — Integration, quality, and submission

### [ ] MVP-12 — End-to-end integration and reliability pass

**Owner:** Unassigned  
**Depends on:** MVP-01 through MVP-11  
**Goal:** Prove the complete demo journey works repeatedly on a clean machine.

**May edit:** Integration wiring, tests, fixtures, and bug fixes in coordination with file owners.  
**Must not do:** Add new features, gateway work, admin UI, future-format support, or broad refactors.

**Checks:** Clean install; add folder; three saves; AI diff; timeline; search; restore; restart;
offline queue; failed/retry state; 50 MB skip; deleted source; keyboard navigation; no backend running.

**Docs to update:** known limitations in the root `README.md`; final stage/decisions in
`PROJECT_STATUS.md`; verify `docs/desktop/overview.md` matches the shipped UI; one line in
`docs/bob-log.md`.

**Done when:** The scripted journey succeeds three consecutive times on Windows, typecheck/build/
tests pass, critical console errors are absent, and known limitations are documented.

### [ ] DEMO-01 — Create and freeze the demo asset pack

**Owner:** Unassigned  
**Depends on:** Human design decision; can begin immediately  
**May edit:** A new clearly documented demo-fixtures folder and related test references.  
**Must not use:** Copyrighted or private assets without permission.

**Docs to update:** a README inside the demo-fixtures folder (each asset's edit sequence and
the expected annotation/search outcomes); one line in `docs/bob-log.md`.

**Done when:** Logo, banner, and product-image histories include controlled color/text/layout edits,
have expected annotation/search outcomes, and are approved by the team for public distribution.

### [ ] SUBMIT-01 — Prepare the judged submission

**Owner:** Unassigned  
**Depends on:** MVP-12, DEMO-01, every member's SkillsBuild activity

**May edit:** `README.md`, `docs/bob-log.md`, demo script/docs, public screenshots/video references.  
**Must not do:** Make last-minute architecture changes while preparing the submission.

**Required deliverables:** Public repository; functioning prototype; README covering problem,
solution, AI approach, theme, and IBM Bob use; video no longer than three minutes; team details;
SkillsBuild completion for every member.

**Docs to update:** this task *is* documentation — root `README.md` (problem, solution, AI
approach, theme, Bob usage), a complete and truthful `docs/bob-log.md`, and a final accuracy
pass over `docs/desktop/overview.md` and `PROJECT_STATUS.md`.

**Done when:** A teammate follows the README on a clean machine, the video is under three minutes,
all links work publicly, secrets/private files are absent, and submission is completed before the deadline.

### [ ] LAND-01 — Build the Chronicle landing page `Stretch`

**Owner:** Unassigned
**Depends on:** MVP-12 (do not let this delay the MVP — `apps/landing/` is optional marketing only)
**Goal:** A single, polished marketing page that sells the "from `final_v8.png` chaos to an AI-annotated version timeline" story and drives a (mock) desktop-app download.

**Required reading first (do this before writing any code):**

- `docs/challenge/VISION.md` (selling point, philosophy, demo beats) and `CONSTRAINTS.md`
  (design language: clean, minimal, dark-first, neutral gray + IBM blue for primary actions,
  system sans-serif) — the page must match Chronicle's visual identity, not invent a new one.
- `docs/challenge/RESEARCH.md` (framing that resonates: "help creators work smarter",
  "version control for the creative industry") — reuse this exact language on the page.
- `apps/landing/README.md` and its existing `src/` — this is Astro → Cloudflare Pages; stay
  within it.
- **Then research references BEFORE designing:** the implementing AI must first prompt the
  user to go research *many* strong, modern landing pages (developer-tool / creative-tool
  sites — e.g. Linear, Raycast, Vercel, Figma, Framer, Arc) and bring back what specifically
  works (layout rhythm, hero framing, motion restraint, typographic scale, spacing). Do not
  start visual work until reference direction is agreed with the user. Copy the *principles*,
  never the assets or exact copy of another product.

**May edit:** `apps/landing/**` only (Astro pages, components, styles, local assets).
**Must not edit:** `apps/desktop/**`, any service, any contract, or any MVP task's files.

**Required functionality:**

- One landing page: hero (headline + subhead + primary CTA), the problem (`_final_v8` pain),
  how it works (watch → auto-version → AI diff → search), and a closing CTA.
- **Call-to-action buttons are mock only** — "Download for Windows" / "Download for macOS"
  that link to a placeholder (e.g. `#` or a "coming soon" state). No real installer, no real
  backend, no forms that collect data, no fake download that pretends to be the real binary.
- Fully static, offline-capable, no external CDN calls (self-host fonts/icons as the rest of
  the repo does).

**No AI-slop bar (explicit acceptance):**

- Restrained, purposeful motion only — subtle scroll reveals / a tasteful timeline animation,
  respecting `prefers-reduced-motion`. No gratuitous gradients, glow, floating blobs, emoji
  soup, generic stock "AI" imagery, or motion for motion's sake.
- Real, specific copy (the actual product story), not vague marketing filler. If it reads like
  a template a hundred other products could use, it fails this bar.
- A teammate reviewing the page should not be able to tell it was AI-generated from its polish
  or restraint.

**Docs to update:** `apps/landing/README.md` (what the page is, that CTAs are mock, how to run
and build); one line in `docs/bob-log.md`.

**Done when:** `npm run dev` and `npm run build` succeed in `apps/landing/`; the page renders
correctly in light and dark; CTA buttons are clearly mock; animations degrade gracefully with
reduced motion; and the team agrees it looks like a deliberate product page, not AI slop.

## Deferred until after the MVP

Do not claim these while any MVP task above is incomplete:

- Control-plane telemetry and account configuration (F8/C6)
- Hosted AI gateway and Python implementation (F9/C7)
- Admin UI, installer/signing, or landing-page polish
- Future formats (SVG, BLEND, OBJ, STEP/STP, PSD, PSB), rename tracking, cloud sync,
  collaboration, branching, or visual diff

## Decisions humans must make—not delegate blindly to an AI assistant

AI coding tools can propose options and write code, but the team remains responsible for:

- **User value:** Does the workflow genuinely help a designer, or merely look technically impressive?
- **Scope:** Is a proposed feature required for the three-minute demo and MVP acceptance criteria?
- **Privacy wording:** Do users clearly understand what stays local and what is sent to an AI API?
- **Provider choice:** Are quality, cost, limits, data retention, and student access acceptable?
- **Design judgment:** Are hierarchy, colors, motion, terminology, and empty/error states understandable?
- **Destructive actions:** Is restore behavior safe and clear enough for real user files?
- **Dependencies:** Is a new package maintained, necessary, licensed appropriately, and simpler than existing tools?
- **Generated code:** Can a teammate explain, test, debug, and maintain it without the assistant?
- **Test evidence:** Was behavior verified with real files and the actual demo editor, not only mocked tests?
- **Submission truthfulness:** Do the README and video accurately describe what the prototype actually does?

If you cannot explain why a technical decision is right for Chronicle, stop, research it, and ask
the team before merging—even if the generated code appears to work.
