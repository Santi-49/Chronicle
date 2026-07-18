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

### [ ] MVP-05 — Implement the secure IPC bridge and handlers

**Owner:** Unassigned  
**Depends on:** MVP-02; coordinate with MVP-03/MVP-04  
**Goal:** Let React use desktop functionality without direct Node/filesystem access.

> Current state: `src/preload/index.ts` is a stub exposing only the app version — no C1
> methods are implemented yet. The database handle is already opened at startup in
> `src/main/index.ts` and waiting for handlers. This task unblocks wiring the existing
> UI (MVP-06/08/11) to real data.

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

> Done so far (on `dev`): custom window title bar with native caption controls, app shell
> with left navigation, welcome/onboarding screen, dark/light/system theme with persistence,
> Settings screen, Ctrl+K search shortcut, focus management on route change. All screens run
> on mock data from `src/renderer/src/data/demoData.ts`.
> Remaining: wire everything to the real C1 bridge once MVP-05 lands (tracked-folder
> controls, AI provider/model/key controls, watcher/job/connectivity status), and the
> "Continue local" vs "Log in" startup choice.
> ⚠️ Alignment needed: the UI presents each tracked folder as a **"project"** with a
> display name, icon, and color (see `docs/desktop/overview.md` — Terminology). The C1
> `TrackedFolder` shape is `{ id, path, addedAt }` and has no display fields. Before
> MVP-05 wiring, either extend the shape via a contract-change PR or keep name/icon/color
> renderer-local.

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

> Done so far (on `dev`): Home, Projects/Project (asset browsing), Timeline, and Version
> Details screens with previews, AI-status states, and back navigation — all rendering
> `demoData.ts`. Remaining: replace mock data with C1 queries/events (live capture updates,
> restore button wiring, real thumbnails) once MVP-05 lands.

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

**Docs to update:** `apps/desktop/src/main/ai/README.md` (pipeline as built); provider
quality/cost/privacy findings in the `docs/challenge/RESEARCH.md` log; front-matter notes on
prompt experiments in `packages/prompts/`; one line in `docs/bob-log.md`.

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

> Done so far (on `dev`): Search screen with Ctrl+K shortcut, result list opening version
> details — on mock data. Remaining: real C1 search calls and the semantic-indexing-pending
> state once MVP-10 exists.

## Phase 5 — Integration, quality, and submission

### [ ] MVP-12 — End-to-end integration and reliability pass

**Owner:** Unassigned  
**Depends on:** MVP-01 through MVP-11  
**Goal:** Prove the complete demo journey works repeatedly on a clean machine.

**May edit:** Integration wiring, tests, fixtures, and bug fixes in coordination with file owners.  
**Must not do:** Add new features, gateway work, admin UI, CAD support, or broad refactors.

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
