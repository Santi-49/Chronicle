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
  exposed to the renderer. They are not sent to Chronicle by default; the only permitted
  exception is POST-03's separate, signed-in, explicit API-key-sync option, where the device
  uploads an end-to-end-encrypted envelope that the control plane cannot decrypt. Plaintext
  keys and the client-side decryption key never reach Chronicle's backend.
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
> `apps/desktop/README.md`): search (MVP-10), register/login (F1). Restore/save-copy
> landed in MVP-07.

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

### [x] MVP-06 — Build the application shell, onboarding, and settings

**Owner:** Santi R (merged into `dev` via `feat/mvp-06-ui-wire`)

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

> Merged into `dev` via `feat/mvp-06-ui-wire`:
> app shell + status bar, welcome/onboarding, theme persistence, and Ctrl+K remain, and the
> whole renderer is now wired to the live C1 bridge (no more `demoData.ts`) via
> `src/renderer/src/lib/{bridge,useChronicle,aiCatalog}.ts`:
> - **Tracked folders / projects** — real `listFolders`/`pickFolder`/`addFolder`/`updateFolder`/
>   `removeFolder`; New/Edit Project uses the native picker/scan + name/description/icon/color,
>   enabled file types, and persistent ignored-file selection.
> - **AI settings** — predefined **Google · Anthropic · OpenAI · Bedrock** providers with a
>   curated quality/price model shortlist per task (change summaries vs. embeddings) and a
>   **Developer mode** toggle for free-text provider/model; encrypted BYOK key with saved/clear
>   state. Persisted via `updateSettings` + `setApiKey`; key never read back.
> - **Status bar / queue** — live `getAppStatus` + `statusChanged` (watched folders, online,
>   AI ready, pending jobs) and a renderer-safe FIFO pending-jobs screen.
> ✅ Contract-alignment resolved: C1 `TrackedFolder` extended to
> `{ id, path, addedAt, displayName, description, icon, color, excludedPaths,
> allowedExtensions }` (idempotent schema migrations + repositories + services + tests);
> `pickFolder()`/`scanFolder(path)`/`addFolder(path, meta?)`/`updateFolder(id, patch)` added.
> Per-provider `setApiKey`/`clearApiKey` and `configuredProviders()` replace the legacy global key.
> The "Log in / Register" startup path stays F1 (low priority) coming-soon. Real-editor
> Windows smoke coverage remains part of the MVP-12 reliability pass.

### [x] MVP-07 — Implement restore and save-copy behavior

**Owner:** Team (completed 2026-07-21)
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

### [x] MVP-08 — Build Assets, Timeline, and Version Details pages

**Owner:** Santi R (live-data UI merged into `dev` via `feat/mvp-06-ui-wire`)

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
> (wired alongside MVP-06 and merged into `dev`): real thumbnails via
> `chronicle://`, live capture/annotation refresh from `versionCaptured`/`annotationUpdated`,
> and the Restore button calls the completed MVP-07 flow. Timeline rows support
> Arrow Up/Down, Home/End, and Enter; pending/failed/restore states have explicit copy,
> failed details can be retried, and missing source files are visibly marked. Restore
> falls back to the native Save a copy dialog when the original folder is gone.

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
> AI feature scope (updated 2026-07-21): the MVP service surface is
> `POST /annotate` (two-image diff; `previous: null` → first-version description),
> `POST /embed-text` (version summaries+tags and search queries),
> `POST /validate-provider-model` (minimal live chat/embedding configuration probe),
> and `GET /health`.
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
persisted, safe retries, queued jobs resumed after outages, a health check, and a
task-specific provider/model reachability probe used before Settings persists a changed
selection. A documented start script for the service.

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

### [x] MVP-10 — Implement hybrid keyword and semantic search

**Owner:** Joan / Santi R · engine and C1 integration complete
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

> Accepted 2026-07-21: FTS5 phrase search and cosine semantic search are merged behind
> C1 `search`; provider-qualified embedding identities prevent incompatible vector
> comparisons; semantic failures degrade to keyword-only. Changing the embedding provider
> or model queues deduplicated re-embedding jobs for every existing annotation without
> repeating vision analysis. The banner fixture regression covers meaning-based queries
> whose words are not an exact stored phrase.

### [x] MVP-11 — Build the Search page

**Owner:** Santi R · complete

**Depends on:** MVP-06, MVP-10; mock results may be used earlier  
**Goal:** Present one simple search experience without exposing implementation modes.

**May edit:** Dedicated renderer search page/components/tests.  
**Must not edit:** Search engine, database, or contracts.

**Contracts upheld:** C1 search request/result shapes; offline-state UX in desktop overview.

**Docs to update:** `docs/desktop/overview.md` Search section (remove the *planned* offline
note once built); one line in `docs/bob-log.md`.

**Done when:** Keyboard search opens a result's version details and clearly explains when recent
semantic indexing is still pending.

> Accepted 2026-07-21: Search with Ctrl+K calls the real C1 hybrid search (debounced), renders
> ranked version results, and opens live version details. A live, screen-reader-announced notice
> now explains when semantic indexing is running, paused offline, or waiting for AI setup while
> confirming that keyword search remains available.

## Phase 5 — Integration, quality, and submission

### [ ] VALIDATE-01 — Validate the default AI provider/model configuration

**Owner:** Unassigned
**Depends on:** MVP-09, DEMO-01
**Goal:** Confirm through current documentation research and repeatable live tests that Chronicle's
shipped default—Google Gemini with `gemini-flash-latest` for annotation and
`gemini-embedding-001` for embeddings—works correctly for a new user and is suitable for the
demo. A historical successful call is evidence, not proof that a changing external default still
works.

**Research first:** Verify the model IDs are currently available through the selected LangChain
integration; support image inputs and text embeddings respectively; work with the documented API
key/account path; and have acceptable pricing, rate limits, regional availability, data handling,
and lifecycle/deprecation status. Record dated findings and primary-source links in
`docs/challenge/RESEARCH.md`. If either default is unsuitable, recommend a replacement and obtain
team approval before changing product configuration.

**May edit:** Default configuration and curated model catalog in `apps/desktop/**`, `.env.example`,
live smoke/integration tests, and provider setup documentation.
**Must not edit:** C3 output semantics, the model-agnostic engine design, or hard-code a provider
inside the AI service.

**Validation matrix:** On a clean setup, exercise Settings' provider/model probe, a first-version
description, the controlled two-version diff, embedding generation, semantic search, invalid-key
feedback, unavailable/rate-limited behavior, and offline queue recovery. Capture latency, token
usage when reported, and estimated cost using a dated pricing source; never commit a real key.

**Docs to update:** `docs/challenge/RESEARCH.md`, the provider setup section of
`apps/desktop/README.md`, `PROJECT_STATUS.md`, and one line in `docs/bob-log.md`.

**Done when:** A fresh BYOK account can run the complete annotation → embedding → semantic-search
flow three times against the demo fixtures; failures remain asynchronous and recoverable; the
configured IDs match current provider documentation; cost/retention/availability caveats are
written down; and the team has explicitly approved or replaced both defaults.

### [ ] MVP-12 — End-to-end integration and reliability pass

**Owner:** Unassigned  
**Depends on:** MVP-01 through MVP-11, VALIDATE-01
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

### [x] DEMO-01 — Create and freeze the demo asset pack

**Owner:** Santi R (merged into `dev` via `feat/mvp-06-ui-wire`)

**Depends on:** Human design decision; can begin immediately  
**May edit:** A new clearly documented demo-fixtures folder and related test references.  
**Must not use:** Copyrighted or private assets without permission.

**Docs to update:** a README inside the demo-fixtures folder (each asset's edit sequence and
the expected annotation/search outcomes); one line in `docs/bob-log.md`.

**Done when:** Logo, banner, and product-image histories include controlled color/text/layout edits,
have expected annotation/search outcomes, and are approved by the team for public distribution.

> Merged and approved for public distribution: committed v1/v2/v3 PNG/JPG sources for logo, banner,
> and product stories; a git-ignored `demo-assets/workspace/`; deterministic
> `reset`/`set`/`next`/`status`/`clean` commands in `scripts/demo_assets.py`; Make targets;
> and [demo-assets/README.md](demo-assets/README.md) with expected diffs. Full search/restore
> journey acceptance remains in MVP-12 rather than in the asset-pack task.

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
- Personal activity/cost analytics and multilingual UI
- Future formats (SVG, BLEND, OBJ, STEP/STP, PSD, PSB), rename tracking, cloud sync,
  collaboration, branching, or visual diff

## Phase 6 — Post-MVP roadmap

These tasks are **out of MVP scope** and must not delay any `MVP-*` task or the Jul 31
submission. They are scoped here so the direction is agreed before work starts. Each still
follows every shared rule above (contract-first, PRs into `dev`, async AI, library defaults,
secrets never in git, `docs/bob-log.md` line per PR). Contract-touching tasks (`C1`, `C3`,
`C5`, `C6`) require a coordinated contract change proposed *before* implementation, per
`docs/contracts.md`.

### [ ] POST-01 — Refactor the AI annotation request to carry an explicit file format `Post-MVP`

**Owner:** Unassigned
**Depends on:** MVP-09
**Goal:** Make the C3 `annotate` request format-aware so the AI service can dispatch
per-format extraction later, *without* changing MVP behavior for images. This is the
prerequisite refactor before any future format is added (POST-02).

> Today C3 carries only base64 bytes + `mediaType` (`ImageInput`). Add an explicit
> `format` field (an enum of supported formats) to the annotate request so the service
> selects the right extraction/preview path per version, rather than inferring it from a
> media type. Keep the change backward-compatible for PNG/JPG so existing captures and the
> demo pack keep working unchanged.

**May edit:** `packages/contracts/ai/**` (through the agreed C3 change: OpenAPI +
`output.schema.json` + generated TS client), `services/ai/**` (request model + dispatch),
`apps/desktop/src/main/ai/**` (worker/client passing the format through), related tests.
**Must not edit:** C3 *output* (annotation) schema semantics, C1, C5, or the control plane.

**Required functionality:** Add a `format` (or `fileType`) enum to the annotate request;
the watcher/capture layer already knows a version's extension, so thread it through the
queue → worker → service; the service maps `format` to a handler and, for the MVP formats,
keeps the current image path. Unknown/unsupported formats are rejected with a clear error,
not silently annotated.

**Contracts touched:** C3 request shape (coordinated change; regenerate TS types). No
output-schema change. AI work stays async.

**Docs to update:** `packages/contracts/ai/interface.ts` doc comments and the C3 row in
`docs/contracts.md`; `services/ai/README.md`; one line in `docs/bob-log.md`.

**Done when:** The annotate request includes a validated `format` field; PNG/JPG diffs and
first-version descriptions still pass on the demo fixtures through the running service;
generated TS types compile; an unsupported format returns a typed error.

### [ ] POST-02 — Extend AI annotation to the future creative formats `Post-MVP`

**Owner:** Unassigned
**Depends on:** POST-01
**Goal:** Add support for the selected future formats behind the format-aware request,
using the researched adapter pipeline: **safe extraction → normalized preview / structure
diff → LangChain annotation**. Do not send opaque project bytes to a model and hope it
understands a proprietary container.

**Required reading first:** `docs/challenge/RESEARCH.md` → "Creative File Formats and the
Version-Sprawl Opportunity" (extraction approach, safety rules, and the agreed prioritization
order: PSD/PSB and SVG first, then BLEND, then OBJ and STEP/STP).

**Format checklist** (mark `[x]` when its extraction + preview + annotation path ships and
is tested on a fixture pair; PNG/JPG are the MVP baseline, already done):

- [x] PNG *(MVP)*
- [x] JPG / JPEG *(MVP)*
- [ ] PSD
- [ ] PSB
- [ ] SVG
- [ ] BLEND
- [ ] OBJ
- [ ] STEP / STP

**May edit:** `services/ai/**` (per-format extractors/preview generators + handlers),
`packages/contracts/ai/**` only to widen the POST-01 `format` enum, format fixtures and
tests, prompt assets under `packages/prompts/` when recording an intentional experiment.
**Must not edit:** C1; C5; the control plane.

**Required functionality:** For each format, a safe extractor (no executing embedded
macros/Python/plug-ins/editor scripts; scripts disabled, restricted network, time/memory
limits, explicit user consent for host-app rendering) that produces a normalized preview
and/or structure JSON; the annotation states both the change and its coverage/confidence
(the nullable C3 `confidence` field) when dependencies are missing or extraction is partial.

**Contracts touched:** C3 request `format` enum widened per format (coordinated). No
output-schema change — `confidence` already exists.

**Docs to update:** `services/ai/README.md` (per-format extraction + safety notes); a
findings entry in `docs/challenge/RESEARCH.md`; front-matter notes on prompt experiments in
`packages/prompts/`; one line in `docs/bob-log.md`.

**Done when:** Each checked format annotates a fixture version pair through the running
service with a factual, coverage-aware message; unsupported/partial cases degrade gracefully
without crashing capture; no untrusted embedded code is ever executed.

### [~] POST-03 — Build the control-plane API and Google sign-in `Post-MVP`

**Owner:** Team (started 2026-07-21 on `feat/post-03-control-plane-google-auth`)
**Scheduling exception:** The team explicitly started POST-03 before the remaining MVP tasks were
complete, overriding the general Phase 6 “do not claim yet” ordering for this branch only.
**Depends on:** Nothing in the MVP (control plane is pre-built auth; extend, don't rewrite)
**Goal:** Stand up the optional control plane (F1/C6) and add **Google sign-in** on top of
the pre-built JWT + Redis whitelist auth, so an account can be linked from the desktop app.
Signing in never gates a local feature (spec F1). A local installation is registered with a
random installation identifier when it can reach the control plane, but registration is
best-effort, queues while offline, and never blocks startup, capture, history, restore, or search.

**May edit:** `services/api/**` (new auth route for Google OAuth, installation registration,
account-settings and encrypted-secret endpoints), `apps/desktop/src/main/**` and the renderer
(auth handoff, installation registration, settings merge, secret encryption and user controls),
`infra/opa/policies/**` (authorization rules), Alembic migrations, `packages/contracts/api/**`
(planned shapes → OpenAPI → `make generate-types`), the desktop startup/settings sign-in flow
in the renderer.
**Must not edit:** Local capture/version/search behavior; C3; the AI service.

**Required functionality:**

1. **Google identity.** Use the system browser and PKCE, request only `openid email profile`,
   validate the Google ID token, identify Google accounts by the stable `sub` claim, and issue
   the existing Chronicle JWT session. Persist an external-identity row (`provider`,
   `provider_subject`, link/last-login timestamps); do not persist Google access/refresh tokens.
   Password hashes become nullable for Google-only accounts. Linking a Google identity to an
   existing password account requires authenticating that account; never merge on email alone.
2. **Portable settings sync.** `GET/PUT /account/settings` round-trips a strictly validated,
   versioned object containing `ai.mode`, annotation provider/model, embedding provider/model,
   future portable UI preferences, `settingsSyncEnabled`, and the telemetry preference/notice
   version/timestamp. Sync is optional and off by default. Do not sync `controlPlane.baseUrl`,
   watched paths, exclusions, project names/descriptions, asset/version records, or whether a
   provider key exists locally. Define revision/ETag conflict behavior before wiring a second
   device; do not silently overwrite a newer settings revision.
3. **Optional API-key sync.** A signed-in user may separately enable API-key sync. It is off by
   default and uses a dedicated encrypted-secret endpoint, not `/account/settings`. Encrypt the
   complete secret envelope on the device with authenticated encryption; the control plane must
   never receive plaintext keys or the decryption key. Research and document the cross-device
   recovery mechanism (for example a user passphrase/recovery key or approved-device transfer)
   before implementation. Support replacement, revocation, and deletion of the encrypted blob;
   decrypted keys return to Electron `safeStorage` and never enter the renderer-visible C5 object.
4. **Installation registration.** Every first-run profile, including "Continue local", creates
   a random resettable installation UUID and attempts `POST /installations/register` when online.
   Store only the UUID, first/last-seen timestamps, app version, OS family, and optional linked
   Chronicle user ID after sign-in. Retry offline without gating the product. Do not use a device
   hardware ID, hostname, account name, fingerprint, or project data. These records measure
   **installations, not unique people**, and the UI/privacy policy must not call them user counts.
5. **Desktop UX.** Sessions persist across restarts with automatic refresh (pre-built stack).
   The Google sign-in control follows Google branding (standard-color "G", approved "Continue
   with Google" wording — see `docs/challenge/RESEARCH.md`); no improvised or recolored mark.

**Contracts touched:** Expand C6 with the Google auth/handoff surface, `POST
/installations/register`, `GET/PUT /account/settings`, and the encrypted-secret operations;
regenerate TS types with `make generate-types`. C5 remains the local settings source of truth:
plaintext API keys never become part of it, and synced settings are merged only through its typed
shape. Update `packages/contracts/api/PLANNED.md` before implementation.

**Docs to update:** `docs/backend/**` (new auth + account-config endpoints), `.env.example`
(OAuth client vars), the startup-flow section of `docs/desktop/overview.md`; one line in
`docs/bob-log.md`.

**Done when:** A user can "Log in / Register" and "Continue with Google" from the app;
portable settings round-trip without secrets or device-local paths; explicitly enabled API-key
sync round-trips only an opaque client-encrypted envelope; a local installation registers when
online but the full product still works before/without that response; Chronicle can report an
honest installation count; and Google/provider/plaintext Chronicle secrets never appear in API
logs, account settings, generated OpenAPI examples, or renderer-visible data.

### [ ] POST-04 — Wire the app to the control plane for usage statistics `Post-MVP`

**Owner:** Unassigned
**Depends on:** POST-03
**Goal:** Report **usage statistics** to the control plane (F8) — including from
**"Continue local"** sessions — while guaranteeing that **no creative content or identifying
project/file metadata ever leave the device**.

> Privacy rule (hard, from F8): telemetry contains **no file contents, no file names, no
> paths, project names/descriptions, previews, hashes, summaries, changes, tags, embeddings,
> or search queries** — only installation/app metadata, random telemetry IDs, counts, size
> buckets, allowlisted file types, provider/model identifiers, success/failure states, and
> timings. "We can see how Chronicle is used; we cannot see your work."
>
> **Product decision (2026-07-21):** the telemetry toggle is enabled by default for local and
> signed-in installations. This is default-enabled collection, **not opt-in**, and must never be
> described as consent merely because a pre-enabled control is shown. Onboarding must show a
> conspicuous disclosure and allow the user to turn it off before the first telemetry batch.
> POST-06 must establish and document a valid lawful basis; if consent is the selected basis,
> this default must change before production because consent must be an affirmative choice.

**May edit:** Desktop telemetry emitter + offline queue (`apps/desktop/src/main/**`),
`POST /telemetry/events` (batch) and project-inventory upsert/delete endpoints in
`services/api/**`, `packages/contracts/api/**` (→ `make generate-types`), telemetry tests.
**Must not edit:** The F8 privacy rule; C3; local capture/version data.

**Required functionality:**

1. **Disclosure and control.** Default the toggle on, but show before first upload: “Help improve
   Chronicle is enabled. Chronicle sends usage counts such as projects, tracked files, versions,
   file types, AI provider/model and timings. Your creative files, project and file names, paths,
   previews, AI summaries/tags and search text are not sent to Chronicle. AI inputs may still go
   to your selected AI provider; API keys leave the device only if you separately enable encrypted
   key sync. You can turn usage reporting off now or later.” Exact final wording is a human/legal
   decision and must match the implemented payloads.
2. **Project inventory.** Give every local project a random, resettable `projectTelemetryId`
   unrelated to its database ID/name/path. Upsert only its tracked-file count and a map of counts
   by allowlisted normalized file type (`png`, `jpg`, later contract-approved values, otherwise
   `other`). Send on enablement, project/file-count change, and a low-frequency reconciliation.
   Delete its server record when the project is removed or telemetry is disabled. This enables
   projects per installation/account and tracked files per project without uploading project
   identity. Do not claim that a project telemetry UUID is anonymous when linked to an account;
   it remains pseudonymous control-plane data.
3. **Usage events.** Batch `app_opened`, `version_captured`, `ai_summary_generated`, and
   `search_performed` with a random event ID, schema version, occurrence time, installation ID,
   and optional project telemetry ID. `version_captured` may contain only file type, a coarse
   size bucket (`<100KB`, `100KB–1MB`, `1–10MB`, `10–50MB`) and capture timing—never an asset ID,
   version ID/number, exact byte size or hash. AI events may contain provider/model,
   annotation-vs-embedding operation, outcome, latency and token counts when available. Search
   events may contain keyword/semantic/hybrid mode, timing and result-count bucket, never query
   text or matched records.
4. **Delivery and validation.** Queue offline, upload asynchronously, use event IDs for
   idempotency, reject unknown event properties/file types server-side, and centralize payload
   construction behind a strict allowlist plus tests that forbidden data cannot serialize.
   Disabling telemetry stops new events, clears the local telemetry queue, and requests deletion
   of the installation/project-level raw telemetry covered by the eventual retention policy;
   minimal installation registration from POST-03 remains a separately disclosed operation.

**Contracts touched:** C6 `POST /telemetry/events` plus `PUT/DELETE
/telemetry/projects/{projectTelemetryId}` → regenerate TS types. Use discriminated event schemas
with `extra="forbid"`; do not accept an arbitrary `props` dictionary.

**Docs to update:** the F1/F8 and data/privacy sections of `docs/spec.md` (the previous signed-in
opt-in wording is superseded), `docs/challenge/CONSTRAINTS.md`, `docs/backend/**`, and the
telemetry/settings sections of `docs/desktop/overview.md`; one line in `docs/bob-log.md`.

**Done when:** After a demo run, an admin can answer how many installations/accounts/projects
are active, projects per account/installation, tracked files per project, file-type distribution,
new versions captured today, and AI/search usage; tests assert forbidden content cannot enter any
payload; local mode sends the same content-free statistics while enabled; disabling reporting
sends no further usage events and removes queued events; offline product behavior is unchanged.

### [ ] POST-05 — Build the admin UI for control-plane data `Post-MVP`

**Owner:** Unassigned
**Depends on:** POST-04
**Goal:** Give admins a real surface for the aggregated usage statistics (F10). MVP baseline
was Swagger (`/docs`); this replaces it with a proper read-only admin view for the `admin`
role that RBAC already supports.

**May edit:** A new admin surface — the decision in `docs/spec.md` §3 prefers an **Admin tab
inside the desktop app** (visible only to `admin`) over a separate web app; read-only stats
endpoints in `services/api/**` if aggregates aren't already exposed; `infra/opa/policies/**`
for the admin authorization rule; `packages/contracts/api/**` (→ `make generate-types`).
**Must not edit:** Local product behavior; the F8 privacy rule (admins see aggregates, never
file content); C3.

**Required functionality:** Authenticated admin-only views of the F8 aggregates: registered
installations separately from accounts/estimated active installations; projects per
account/installation; tracked files per project; file-type distribution; versions captured over
time; AI calls, outcomes, token counts and latencies; provider/model mix; search counts/modes over
time. Show aggregates by default and do not expose project telemetry IDs or event-level records in
the UI. No access to any project/file name, path, content, hash, preview, summary/tag, embedding,
or search query; graceful empty/error states.

**Contracts touched:** C6 read-only stats endpoints if added → regenerate TS types.

**Docs to update:** `docs/backend/**` and `docs/desktop/overview.md` (admin surface); one
line in `docs/bob-log.md`.

**Done when:** An `admin` user reads live aggregates through the admin UI; a non-admin cannot
reach it; no file-level data is ever exposed.

### [ ] POST-06 — Make Chronicle GDPR-compliant `Post-MVP`

**Owner:** Unassigned
**Depends on:** POST-03, POST-04 (data handling, consent, and account data must exist first)
**Goal:** Bring the app and control plane into GDPR compliance: select and document a lawful
basis for each distinct operation (minimal installation registration, default-enabled usage
telemetry, account/settings sync, encrypted secret sync, and AI-provider calls); clearly disclose
what stays local vs. what is sent; implement data-subject rights (access, export, erasure); and
publish a written privacy policy.

**Required reading first:** the F8 privacy rule and the "Privacy wording" item in the
"Decisions humans must make" section below — the exact user-facing wording is a **human
decision**, not something to auto-generate.

**May edit:** Consent/telemetry UX in the desktop app, account-data export/delete endpoints
in `services/api/**` (reuse the existing "Delete project and history" local flow for local
erasure), retention configuration, `packages/contracts/api/**` (→ `make generate-types`),
a privacy-policy document.
**Must not edit:** The local-first guarantee (the version library never leaves the device);
C3 output semantics.

**Required functionality:** Record the telemetry preference, disclosure/privacy-notice version,
timestamp, installation, and authenticated account when present. The 2026-07-21 product decision
defaults telemetry on; obtain legal review of its lawful basis and change it to affirmative opt-in
before production if relying on consent. Provide plain-language, separate controls/disclosures for
usage telemetry, portable settings sync, and end-to-end-encrypted API-key sync. Explain accurately
that the local version library is not uploaded, image/text inputs used for inference leave the
device under the selected AI path, usage counts go to Chronicle while enabled, installation
registration occurs when online even when usage telemetry is disabled, and an encrypted secret
blob leaves the device only when key sync is enabled. Implement account/installation-data
**export** and **erasure** (right to be forgotten), withdrawal/secret deletion, documented raw
event/project-inventory/aggregate/installation retention periods, and a privacy policy linked from
the app. Never promise that “all data stays local”; name each exception.

**Contracts touched:** C6 export/delete endpoints if added → regenerate TS types.

**Docs to update:** a new privacy-policy doc; the privacy sections of `docs/spec.md` /
`docs/challenge/CONSTRAINTS.md` if wording changes; one line in `docs/bob-log.md`.

**Done when:** A user can inspect/disable usage reporting, independently enable/disable settings
and encrypted-key sync, export and delete their linked account/installation/control-plane data,
and read an accurate privacy policy; the team has recorded a defensible lawful basis for every
collection purpose; disclosures and retention match what the app/API/logging infrastructure
actually send/store; and the local creative library is never uploaded.

### [ ] POST-07 — Research and improve the install / onboarding experience `Post-MVP`

**Owner:** Unassigned
**Depends on:** MVP-12 (a working, packaged app to install)
**Goal:** Research and improve the first-run install/onboarding screen so a new user gets
from "just installed" to "folder tracked, first version captured" with minimal friction —
including the Python AI-service prerequisite (spec Risk #8) surfaced clearly.

**Required reading first:** the startup-flow section of `docs/desktop/overview.md` (Continue
local vs. Log in / Register), and Risk #8 in `docs/spec.md` §8 (the demo machine needs Python
3.12 + the AI service running; the app degrades gracefully and shows a health check).
**Then research references** with the user before designing (as LAND-01 requires for the
landing page): strong desktop-app onboarding patterns; agree direction before visual work.

**May edit:** Renderer onboarding/first-run screens and the status-bar AI-service health
affordance (`apps/desktop/**`), electron-builder installer config if packaging is in scope.
**Must not edit:** C1/C3/C5 contracts; local capture behavior.

**Required functionality:** A clear first-run flow (pick a folder, understand Continue local
vs. account, understand and check the AI-service prerequisite) that never blocks core capture
when AI is unavailable; graceful empty/error/"AI pending" states; the "No AI-slop bar" quality
standard from LAND-01 applies to the visuals.

**Docs to update:** `docs/desktop/overview.md` (onboarding flow), `apps/desktop/README.md`
(install/run + AI-service prerequisite); one line in `docs/bob-log.md`.

**Done when:** A teammate who has never seen the app can install it, understand the AI
prerequisite, track a folder, and capture a first version without help; capture still works
when the AI service is down (versions show "pending").

### [ ] POST-08 — Publish the app and wire Windows auto-update `Post-MVP`

**Owner:** Unassigned
**Depends on:** MVP-12 (a working, buildable app to package)
**Goal:** Ship an installable Windows build and give it in-place auto-update via **GitHub
Releases**, using the electron-builder / electron-updater pair, **unsigned for now**. This is
the cheap Tier 1 path only — code signing, notarization, and macOS auto-update are deferred
to a separate follow-up task (see note below), because they are a recurring-cost and
identity decision the team must own.

> How it works (for reviewers): electron-builder produces `Chronicle-x.y.z.exe` (NSIS) plus a
> `latest.yml` metadata file; both are published to a GitHub Release. The installed app calls
> `autoUpdater.checkForUpdates()`, which reads `latest.yml` from the release, compares versions,
> downloads a newer installer in the background, and applies it on quit/relaunch. The "update
> server" is just static release assets — no backend to build.
>
> Explicit non-goals for this task: no Windows code-signing certificate (SmartScreen warnings
> are accepted for now), no Apple Developer ID / notarization, and **no macOS auto-update**
> (macOS requires a matching signature, so it cannot work unsigned — track it in the follow-up).

**May edit:** `apps/desktop/` electron-builder config (`electron-builder.yml`/`package.json`
build block, NSIS target, `provider: github`), a publish script/CI workflow that runs
`electron-builder --publish`, the main-process auto-update wiring, `apps/desktop/README.md`.
**Must not edit:** C1/C3/C5 contracts; local capture/version/search behavior; the local-first
guarantee.

**Required functionality:** A reproducible `npm run build` → published GitHub Release
(installer + `latest.yml`) via a `GH_TOKEN`; main-process update check that runs on launch and
degrades silently offline (never blocks capture/timeline/restore — same discipline as the AI
queue); an in-app "update available / downloading / restart to update" affordance; semantic
version bumped from `package.json`. The update check is a network call only for the app binary —
**no user data or file content is ever sent**.

**Contracts upheld:** none changed. Local-first and offline-tolerant behavior preserved.

**Docs to update:** `apps/desktop/README.md` (release + auto-update steps, `GH_TOKEN`, the
unsigned/SmartScreen caveat, macOS-not-yet note); one line in `docs/bob-log.md`.

**Done when:** Publishing a release makes an older installed Windows build detect, download,
and apply the update on relaunch; the app launches and captures normally with no network; the
SmartScreen/unsigned limitation and the deferred signing + macOS work are written down as a
follow-up task.

### [ ] POST-09 — Build the user Activity & Cost dashboard `Post-MVP`

**Owner:** Unassigned
**Depends on:** MVP-09; POST-04 only for optional cross-device/server-backed history
**Goal:** Give each user a GitHub-style view of their own Chronicle activity and, most
importantly, a trustworthy view of AI usage and estimated spend. The local dashboard must work
without an account or Chronicle backend; signing in may add synchronized aggregates later.

**May edit:** Local usage/cost persistence, C1/C5 through an approved contract change, renderer
dashboard components in `apps/desktop/**`, AI usage normalization in `services/ai/**`, and optional
user-scoped aggregate endpoints in `services/api/**` plus C6.
**Must not edit:** The local-first guarantee, telemetry consent, admin-only global aggregates, or
upload creative content/query text to power the dashboard.

**Required functionality:**

1. **Activity view.** Show a contribution-style calendar and useful personal totals/trends for
   versions captured, assets/projects active, AI summaries, searches, and restores. Provide clear
   date range, timezone, empty, loading, offline, and partial-data states; do not turn vanity
   metrics into fake productivity scores.
2. **Cost gathering.** Persist provider/model/operation, timestamp, success state, latency, input
   and output tokens when the provider exposes them, and provider-reported cost when available.
   Keep unknown values unknown—never write zero merely because an SDK omitted usage metadata.
3. **Cost estimation.** Maintain a versioned, dated price snapshot per provider/model and compute
   estimates from the applicable snapshot. Clearly label **provider-reported**, **estimated**, and
   **unavailable** amounts; show currency, pricing date, annotation vs. embedding breakdown, and
   explain that provider invoices are authoritative. Research current official pricing and usage
   metadata support before implementation.
4. **Privacy and scope.** Personal on-device analytics may use local records, but any sync reuses
   POST-04's strict content-free allowlist. A signed-in user can see only their own aggregates;
   admins' cross-installation view remains POST-05. Cost collection and rendering must remain
   asynchronous and must never block capture or AI jobs.

**Contracts touched:** C1/C5 for local dashboard queries/preferences; optional C6 user-scoped
aggregate endpoints. Define native schemas first and regenerate derived types where applicable.

**Docs to update:** `docs/desktop/overview.md`, AI usage/cost behavior in `services/ai/README.md`,
privacy/data wording in `docs/spec.md` if sync is added, dated provider-pricing findings in
`docs/challenge/RESEARCH.md`, and one line in `docs/bob-log.md`.

**Done when:** A local user can understand daily activity and AI spend by date/provider/model/
operation; totals reconcile against fixture calls and known token counts; missing usage remains
visibly unavailable; estimate tests use versioned price fixtures; another user cannot access the
data; and the dashboard works offline without sending any new data.

### [ ] POST-10 — Add multilingual UI support `Post-MVP`

**Owner:** Unassigned
**Depends on:** MVP-12 (stabilized user-facing copy and flows)
**Goal:** Internationalize Chronicle so the desktop UI can be translated without duplicating
screens or mixing locale logic into product behavior.

**Research first:** Confirm the initial target locales and translation ownership with the team;
audit all renderer strings, validation/error mappings, dates, relative times, numbers, currencies,
pluralization, accessibility labels, and installer/onboarding copy. Choose a maintained React i18n
library only after comparing it with the existing stack and document the decision.

**May edit:** Renderer UI and tests, locale resources, persisted locale preference through an
approved C5 change, and desktop documentation.
**Must not edit:** Internal error codes or stored AI annotations merely to translate the shell;
contracts should continue to carry stable codes/data rather than localized backend strings.

**Required functionality:** Externalize all user-facing strings; provide an explicit language
selector plus system-locale default/fallback; format dates, times, numbers, and currencies with
locale-aware APIs; support interpolation/plurals without string concatenation; lazy-load locale
resources; fall back safely to English for missing keys; and add pseudolocalization/layout tests
to catch clipping. AI-generated summaries stay in their original language until a separate,
explicit annotation-language policy is researched and approved.

**Docs to update:** `docs/desktop/overview.md`, `docs/spec.md` (supported locales and fallback),
translator/contributor instructions, and one line in `docs/bob-log.md`.

**Done when:** Every shipped screen is covered by the translation catalog; the team-approved
locales can be switched without restart; preference persists; locale formatting and plurals are
tested; pseudolocalized text remains usable at supported window sizes; and missing translations
degrade to English without exposing raw keys.

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
