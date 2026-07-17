# Chronicle MVP Task Board

> This is the executable team plan. Claim one task, stay inside its file boundary, and
> merge it into `dev` only after its acceptance checks pass.

Status: `[ ]` not started · `[~]` in progress · `[x]` merged into `dev` · `[!]` blocked

## Before claiming a task

1. Write your name beside **Owner**. One primary owner avoids duplicate work.
2. Read the task's references and contracts completely.
3. Create a branch from the latest `dev`: `feat/mvp-XX-short-name`.
4. Edit only the listed files. Ask the affected owner before crossing a boundary.
5. If a contract must change, stop and propose that change separately before continuing.
6. Add tests, update relevant documentation, and add one line to `docs/bob-log.md`.
7. Open a PR into `dev`; never push feature work directly to `dev` or `main`.

## Shared rules every task must uphold

- Chronicle's version library and SQLite data stay on-device.
- AI inference is API-based through LangChain. BYOK credentials are encrypted locally and
  never exposed to the renderer or sent to Chronicle's backend.
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

**Done when:** No critical task or compliance requirement is unowned.

## Phase 1 — Desktop foundation

### [~] MVP-01 — Install and verify the desktop foundation

**Owner:** Santi R (completed on `feat/mvp-02-sqlite-repositories`, PR into `dev` pending)  
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

**Done when:** Clean install, `npm run dev`, `npm run typecheck`, `npm test`, and
`npm run build` work on the primary Windows machine. Native SQLite loading is verified.

> Completed via `feat/mvp-02-sqlite-repositories` (renderer shell was already built):
> `better-sqlite3`, Chokidar, Tailwind 4 (wired but inert until a stylesheet imports it),
> and Vitest installed at exact versions; `npm test` runs under Electron's Node via
> `ELECTRON_RUN_AS_NODE` after `electron-rebuild` in postinstall; native SQLite loading
> in Electron 43 verified; explicit secure BrowserWindow defaults; app data/library
> paths established and the database opens on startup. See `apps/desktop/README.md`.

## Phase 2 — Local capture core

### [~] MVP-02 — Implement SQLite initialization and repositories

**Owner:** Santi R (implemented on `feat/mvp-02-sqlite-repositories`, PR into `dev` pending)  
**Depends on:** MVP-01  
**Goal:** Persist folders, assets, versions, annotations, embeddings, jobs, and settings.

**May edit:** `apps/desktop/src/main/db/**` and DB-focused tests.  
**Must not edit:** Renderer, preload, watcher, AI implementation, `src/shared/ipc.ts`.

**Required functionality:** Open the database in the Electron user-data directory, apply
the schema safely, use transactions for multi-record changes, and expose small repository
functions needed by versioning/search. Keep file bytes out of SQLite.

**Contracts upheld:** Return domain data compatible with C1 view shapes when composed by
handlers. Treat `schema.sql` as implementation-owned; document any migration decision.

**Done when:** Tests cover first startup, repeat startup, uniqueness, append-only version
numbers, foreign keys, transaction rollback, and JSON/vector round trips.

### [ ] MVP-03 — Implement and test folder watching

**Owner:** Unassigned  
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

**Done when:** Automated tests pass and a manual test in the actual demo editor produces one
candidate per save, including temp-write/atomic-rename behavior.

### [ ] MVP-04 — Implement content-addressed version capture

**Owner:** Unassigned  
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

**Done when:** Three changed saves create exactly three versions; identical bytes create no
new version; duplicate content is stored once; 50 MB and missing-file cases are handled.

### [ ] MVP-05 — Implement the secure IPC bridge and handlers

**Owner:** Unassigned  
**Depends on:** MVP-02; coordinate with MVP-03/MVP-04  
**Goal:** Let React use desktop functionality without direct Node/filesystem access.

**May edit:** `apps/desktop/src/preload/index.ts`, new `apps/desktop/src/main/ipc/**`, and
IPC-focused tests.  
**Must not edit:** `apps/desktop/src/shared/ipc.ts` unless a separate contract-change PR is approved.

**Required functionality:** Expose only `ChronicleBridge`, validate renderer inputs, register
and unregister main handlers, forward typed events, and return safe URLs/metadata rather than
raw files or secret values.

**Contracts upheld:** Every C1 method, result, event, unsubscribe behavior, and secret boundary.

**Done when:** Contract tests show every implemented handler matches C1; the renderer cannot
access Node APIs, filesystem paths outside returned metadata, API keys, or auth tokens.

## Phase 3 — User interface and restore

### [ ] MVP-06 — Build the application shell, onboarding, and settings

**Owner:** Unassigned  
**Depends on:** MVP-01, MVP-05  
**Goal:** Provide understandable navigation and let users start tracking folders/configure AI.

**May edit:** Renderer app shell, navigation, onboarding, settings pages/components/styles
under `apps/desktop/src/renderer/src/**`.  
**Must not edit:** Main-process implementations or shared contracts.

**Required functionality:** Continue-local startup, Assets/Search/Settings navigation, status
bar, empty state, tracked-folder controls, AI provider/model/key controls, and accessible
keyboard/focus behavior. Never read an API key back into the renderer.

**Contracts upheld:** C1 methods/events and C5 settings/security behavior.

**Done when:** A new user can launch, choose local mode, add a folder, understand AI setup,
and see watcher/job/connectivity status without assistance.

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

**Done when:** Restoring v2 from v5 writes v2 bytes and creates v6; missing-folder save-copy works.

### [ ] MVP-08 — Build Assets, Timeline, and Version Details pages

**Owner:** Unassigned  
**Depends on:** MVP-05, MVP-06; usable mock data may be used earlier  
**Goal:** Make the complete version history understandable to a first-time user.

**May edit:** Dedicated renderer pages/components/tests for assets, timeline, version details,
previews, status chips, and restore controls.  
**Must not edit:** Main-process services or shared contracts.

**Contracts upheld:** C1 asset/version/detail shapes and events; page behavior in
`docs/desktop/overview.md`.

**Done when:** New captures appear without reload, keyboard navigation works, pending/failed
AI states are clear, and a new teammate can answer what changed between versions.

## Phase 4 — AI and search

### [ ] MVP-09 — Research and implement API-based AI annotation

**Owner:** Unassigned  
**Depends on:** MVP-01, MVP-02, MVP-04  
**Goal:** Produce structured summaries, changes, and tags asynchronously through LangChain.

**May edit:** `apps/desktop/src/main/ai/**`, a narrowly scoped credential module under
`apps/desktop/src/main/security/**`, AI tests/fixtures, prompt files under `packages/prompts/`
when recording an intentional experiment, and `apps/desktop/package.json`/lockfile only for
the researched LangChain/provider dependencies.  
**Must not edit:** C3 input/output contract or schema without a separate approved change.

**Required functionality:** Use LangChain-native structured output where supported, load the
Markdown/YAML prompt asset, call the configured API provider, validate against the schema,
persist status/output/provider/model/latency, retry safely, and resume queued jobs after outages.
Use Electron `safeStorage` for the BYOK credential.

**Contracts upheld:** C3 operation functionality and schema; C5 secret boundary; all AI work async.

**Done when:** First-version description and two-image diff work on demo fixtures; invalid output,
missing key, provider error, retry, and offline queue behavior are tested. No local model is added.

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

**Done when:** “version with the tagline” and “blue background” find the expected fixtures;
ranking, empty query, unavailable embeddings, and model changes are tested.

### [ ] MVP-11 — Build the Search page

**Owner:** Unassigned  
**Depends on:** MVP-06, MVP-10; mock results may be used earlier  
**Goal:** Present one simple search experience without exposing implementation modes.

**May edit:** Dedicated renderer search page/components/tests.  
**Must not edit:** Search engine, database, or contracts.

**Contracts upheld:** C1 search request/result shapes; offline-state UX in desktop overview.

**Done when:** Keyboard search opens a result's version details and clearly explains when recent
semantic indexing is still pending.

## Phase 5 — Integration, quality, and submission

### [ ] MVP-12 — End-to-end integration and reliability pass

**Owner:** Unassigned  
**Depends on:** MVP-01 through MVP-11  
**Goal:** Prove the complete demo journey works repeatedly on a clean machine.

**May edit:** Integration wiring, tests, fixtures, and bug fixes in coordination with file owners.  
**Must not do:** Add new features, gateway work, admin UI, CAD support, or broad refactors.

**Checks:** Clean install; add folder; three saves; AI diff; timeline; search; restore; restart;
offline queue; failed/retry state; 50 MB skip; deleted source; keyboard navigation; no backend running.

**Done when:** The scripted journey succeeds three consecutive times on Windows, typecheck/build/
tests pass, critical console errors are absent, and known limitations are documented.

### [ ] DEMO-01 — Create and freeze the demo asset pack

**Owner:** Unassigned  
**Depends on:** Human design decision; can begin immediately  
**May edit:** A new clearly documented demo-fixtures folder and related test references.  
**Must not use:** Copyrighted or private assets without permission.

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

**Done when:** A teammate follows the README on a clean machine, the video is under three minutes,
all links work publicly, secrets/private files are absent, and submission is completed before the deadline.

## Deferred until after the MVP

Do not claim these while any MVP task above is incomplete:

- Control-plane telemetry and account configuration (F8/C6)
- Hosted AI gateway and Python implementation (F9/C7)
- Admin UI, installer/signing, or landing-page polish
- CAD/non-image formats, rename tracking, cloud sync, collaboration, branching, or visual diff

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
