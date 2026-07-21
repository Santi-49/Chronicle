# Chronicle — Team Spec: Tech Stack, Best Practices, Functionality

> **Status:** agreed 2026-07-16; implementation details synced 2026-07-21. This is the
> "same direction" document — read it before building anything. It defines **what** we build
> and **with which tools**, not **how**. Current progress and ownership live in
> [PROJECT_STATUS.md](../PROJECT_STATUS.md) and [TODO.md](../TODO.md).

---

## 1. What We're Building (one paragraph)

**Chronicle** is a desktop app for designers. You point it at the folders where you work; every time you save an image (PNG/JPG in the MVP), Chronicle silently records that save as a **version** — like git commits, but automatic. An AI then writes the "commit message" for you: a plain-English summary of what changed ("background navy → teal; tagline removed") plus tags. The app shows each file's full version timeline, lets you **restore** any old version, and lets you **search your history by meaning** ("the one with the blue background"). Version storage stays on-device, and capture/history/restore work without Docker or an API connection. AI inference is API-based through LangChain: the BYOK path sends the required inputs directly to the provider configured by the user, while an optional backend gateway is stretch scope. Selected future formats after the PNG/JPG MVP: **SVG, BLEND, OBJ, STEP/STP, PSD, and PSB**.

---

## 2. Tech Stack — Complete List

Everything below is decided. Anything not listed here is **not** part of the stack — propose additions in a PR to this file.

### Desktop app (`apps/desktop/`) — the product

| Layer | Choice | Why |
|---|---|---|
| App shell | **Electron 43** + **electron-vite 4** | Desktop app with web tech; already scaffolded and verified |
| UI | **React 19 + TypeScript 5.9** | Team-known, typed |
| Styling | **Tailwind CSS 4** | Fast to build clean UI; no component library unless a real need appears |
| Local database | **SQLite** via **better-sqlite3** (runs inside the app, single file) | Zero-setup embedded DB; metadata, AI summaries, search index all in one file |
| File watching | **chokidar** | Battle-tested cross-platform watcher; same code on Windows and macOS |
| Hashing | Node.js built-in `crypto` (**SHA-256**) | Detects "did the content actually change"; no dependency |
| AI engine | **Local Python AI service** (`services/ai/`): **FastAPI** + **LangChain (Python)**, model-agnostic, **default classes/methods only** — the Electron main process calls it on `127.0.0.1` | AI features are developed in Python (team decision 2026-07-19, replaces LangChain.js in-app); provider swappable (Anthropic, watsonx/Granite, OpenAI…); one AI codebase shared with the stretch gateway |
| Embeddings storage | Vectors stored **in SQLite**, similarity computed in-process | Hundreds of versions ≠ vector DB territory; simplest thing that works |
| Packaging (stretch) | **electron-builder** | Produces a Windows installer for the demo if we want one; dev mode is fine for the video |

### Backend control plane (`services/api/` + `services/module/`) — pre-built, we extend · **lowest priority (non-essential)**

| Layer | Choice | Why |
|---|---|---|
| API | **FastAPI (Python 3.12)** + Postgres 16 + Redis 7 + OPA | Already built: register/login/JWT/refresh/logout, RBAC, user CRUD |
| New endpoints we add | Google auth, installation registration, portable settings, opaque encrypted-secret storage, telemetry/stats, *(stretch)* AI-inference gateway | See §4 F1/F8/F9 |
| AI calls (gateway path, stretch) | Reuses the **same `services/ai/` Python implementation** behind the control plane | One AI codebase — no JS/Python twin to keep in sync |
| Migrations | Alembic (`make makemigration`) | Template standard |

### Landing page (`apps/landing/`) — optional

| Layer | Choice |
|---|---|
| Framework | **Astro** (static) → Cloudflare Pages — build only if time remains after MVP |

### Cross-cutting

| Concern | Choice |
|---|---|
| Contracts | Boundary operations and data formats mapped in [contracts.md](contracts.md): IPC · persistence behavior · AI I/O · watcher decisions · settings · control-plane OpenAPI · optional module `Protocol`. SQLite DDL, prompts, algorithms, provider choices, and orchestration are implementation specifications, not contracts. |
| Testing | **Vitest** for desktop logic (hashing, version rules, search ranking) · **pytest** for the AI service and backend |
| Lint/format | **ESLint + Prettier** (TS) · **Ruff** (Python) |
| Dev tool | **IBM Bob** — mandatory, judged. Every member logs usage in [bob-log.md](bob-log.md) |
| Runtimes | Node 20+, Python 3.12 (AI service + backend), Docker Desktop (control plane only — never needed for the AI service) |

### One important subtlety: where the AI code runs (decided 2026-07-19)

AI features are written **once, in Python**, in a **local AI service** (`services/ai/`):
a small FastAPI app using LangChain (Python) that runs on the user's machine and listens
only on `127.0.0.1`. The Electron **main process** starts/health-checks it and calls it
over local HTTP; the React renderer still talks only to the main process (C1). This is
**not** the control-plane backend (`services/api/`) — the AI service is part of the
desktop product: no Docker, no Postgres, no account.

- **BYOK (MVP):** the key is stored encrypted by the app (Electron `safeStorage`) and
  passed per-request to the local AI service, which forwards it only to the configured
  provider. The service never persists it. It stays off Chronicle's backend unless the user
  separately enables E2E-encrypted API-key sync, which uploads only an opaque envelope.
- **Gateway (stretch, F9):** the control plane exposes the same operations for users
  without a key, reusing the same `services/ai/` implementation.

Why a Python service instead of LangChain.js inside Electron: the team develops AI
features in Python, LangChain's Python ecosystem is the reference implementation, and
the stretch gateway reuses the code instead of maintaining a JS twin. Accepted
trade-off: dev/demo needs a Python 3.12 runtime next to the app (a start script covers
it); bundling the service into the installer is stretch scope.

There is no local-model path in the MVP. “Local” refers to local storage, local
orchestration, and the locally running AI service; inference uses an external API
through LangChain. The desktop app and the service share one functional input/output
contract (C3). Prompt assets live in `packages/prompts/` as Markdown with YAML front
matter and are loaded from there rather than embedded in code.

---

## 3. Where Everything Lives (plain-language architecture)

**On the user's machine (everything about their files):**

- **The user's own folders** — untouched. Chronicle only *reads* them (and writes on restore).
- **Chronicle's library** — a folder in the app's data directory holding a copy of every version's file bytes, stored under its content hash. Identical content is stored **once**, even across different files (free deduplication). Originals, no compression, no deltas.
- **Chronicle's database** — one SQLite file next to the library: assets, versions, AI summaries, tags, embeddings, settings, and the offline queue.
- **Chronicle's AI service** — a local Python process (`services/ai/`, FastAPI + LangChain) the main process calls for annotations and embeddings. Stateless and loopback-only: it sees only the images/text the app sends per request and forwards them to the configured provider.

**On our backend (never any file content) — optional, lowest priority.** The app is fully usable account-less ("Continue local" at startup); an account only adds telemetry/stats and (stretch) hosted inference:

- Accounts (register/login — the pre-built JWT stack).
- Revisioned portable settings (appearance, preferred AI providers/models, sync flags, telemetry preference). Device-local paths, projects, and file history are excluded.
- An optional encrypted-secret envelope. API-key sync is independently enabled, uses a user passphrase plus authenticated encryption on-device, and gives the backend neither plaintext keys nor the decryption key.
- A random installation record for every reachable first-run profile, including local mode. It contains app/OS and first/last-seen metadata and measures installations—not unique people.
- Telemetry events and aggregated stats (see F8 for the exact privacy rule).
- *(Stretch)* the AI-inference gateway.

**Admin stats surface (decision):** admins consume stats through the API's built-in **Swagger UI** (`/docs`) — zero UI to build for the MVP. If time remains, an **Admin tab inside the desktop app** (visible only to the `admin` role, which RBAC already supports). We deliberately do **not** build a separate web app — we deleted it to avoid distraction.

---

## 4. Functionality — MVP Spec

Each feature states its rules and a "done when" test. **Scope labels:** `MVP` must ship by Jul 27 · `Low` = control-plane features — non-essential (the app fully works without them), build **last** · `Stretch` only after everything else works.

> UI surface for every feature: [desktop/overview.md](desktop/overview.md) — pages, layout, startup flow.

### F1 — Accounts & sign-in `Low` (control plane — optional)

- On first launch the app offers **"Continue local"** (default) or **"Continue with Google"** through the operating system's default external browser using OAuth Authorization Code + PKCE. Do not use an Electron `BrowserWindow`/webview for Google auth. The pre-built password endpoints remain available to API clients; the implemented desktop account surface is Google-first.
- Google ID tokens are verified server-side and bound by stable Google `sub`; an existing password account is never merged by email alone. The app stores only Chronicle JWTs, not Google access/refresh tokens.
- An account can be linked later from Settings; signing in never gates a local feature. It enables optional portable settings sync, separately opted-in E2E API-key sync, and the gateway option (F9).
- Before Google sign-in is enabled/opened, the app calls the public Chronicle API health endpoint with a short timeout. Failure keeps local mode usable and offers an explicit retry instead of repeatedly opening Google. An expired, cancelled, or lost loopback handoff closes cleanly and becomes concise inline copy; raw Electron IPC messages never reach the user.
- Encrypted API-key sync is an independent signed-in-only checkbox, off by default. Enabling it reveals a compact passphrase row with explicit **Save encrypted copy** and **Restore to this device** actions; disabling it deletes the cloud envelope while retaining local keys. The passphrase is used only for the selected action, is cleared afterwards, and is not synced or recoverable.
- Every install keeps a random, resettable installation UUID and attempts registration without blocking startup. This measures installations, not unique users, and includes no hardware ID, hostname, paths, or project data.
- If signed in: the session persists across restarts; token refresh is automatic (pre-built stack). Signing in requires internet **once**; after that everything except AI calls and telemetry works offline (those queue — see F4/F8).
- **Hard rule:** the app runs with **no Docker setup and no Chronicle API connection**. Capture, cached timeline, restore, and keyword search remain usable offline; AI summaries and semantic indexing queue until their configured API is reachable.
- **Done when:** fresh install → "Continue local" → capture, timeline, restore, and keyword search work with no backend; Google sign-in yields a refreshable Chronicle session; an unhealthy API never opens the browser; timeout/cancellation never leaks raw IPC errors; portable settings round-trip without local data; explicitly enabled key sync round-trips only an opaque client-encrypted envelope.

### F2 — Tracked folders `MVP`

- The user adds/removes folders to track from a Settings screen; the list persists locally.
- Removing a project offers two explicit outcomes: **Stop tracking** keeps its local history,
  while **Delete project and history** permanently removes its assets, versions, AI/search
  metadata, queued AI work, and any content blobs not shared by another version. Neither option
  deletes the user's original working files. The confirmation presents both outcomes as peer
  actions, with permanent history deletion carrying the stronger danger treatment.
- The UI presents a tracked folder as a project with a persisted display name, optional
  description, icon, and accent color; this is presentation metadata, not a grouping layer.
- Before adding a project, a read-only recursive scan previews supported files. The user may
  exclude individual files and disable a supported file type. These selections persist and
  are enforced on both the initial capture and later saves; editing a project can change them.
- Watching is recursive (subfolders included), subject to the project's saved exclusions.
- Only `.png`, `.jpg`, `.jpeg` files count (case-insensitive). Other formats are ignored. The UI lists `.svg`, `.blend`, `.obj`, `.step`/`.stp`, `.psd`, and `.psb` as "coming soon". These future labels are roadmap communication, not supported MVP behavior.
- Hidden files/folders and temp files (e.g. `~$…`, `.tmp`, editor autosave/swap files) are ignored.
- **Done when:** add a folder, save a PNG in a subfolder → version appears; save a `.txt` → nothing happens.

### F3 — Version capture `MVP`

The heart of the product. Exact rules:

1. A save is considered **finished** when the file has stopped changing for **~2 seconds** (editors often write in several bursts, or write a temp file and rename it — both must produce exactly one version).
2. The finished file is hashed (SHA-256).
3. If the hash equals that file's latest version → **no new version** (re-saves without changes are free).
4. If the file path is new → create an **Asset** with **version 1**. Otherwise → append **version N+1** to the existing asset.
5. The file bytes are copied into the library under their hash; the version record stores: version number, hash, timestamp, file size, image dimensions.
6. Files over **50 MB** are skipped with a visible notice.
7. **Identity = file path** (MVP): renaming or moving a file starts a new asset. Deleting a file keeps its history visible, marked "file no longer on disk". *(Known limitation — say it in the README; content-hash identity across renames is future work.)*
8. Hashing and copying never block the UI.
- Normal capture and restore remain append-only. The Timeline also provides an explicit,
  destructive **Reset history to v1** maintenance action behind a typed `RESET` safeguard:
  it keeps the latest stored snapshot as a fresh v1, removes that asset's prior timeline and
  derived AI/search records, and queues a new initial-version annotation. Content-addressed
  library blobs may remain until safe orphan cleanup because bytes can be shared across assets.
- **Done when:** edit + save an image 3 times → exactly 3 versions with correct numbering; save with no visual change but identical bytes → no version; version appears < 5 s after the save settles.

### F4 — AI change summary (the "commit message") `MVP`

- When a new version is captured, an **async job** sends the *previous* image + *new* image (plus filename) to the **local AI service**, which calls a vision-capable model via LangChain (Python) and returns structured output: **summary** (1 sentence), **changes** (bullet list), **tags** (3–8 lowercase keywords), and an optional **confidence** (0–1, nullable — reserved for future partial-extraction formats).
- The AI connection is configured per task in **Settings → AI**: provider/model for change
  summaries and provider/model for embeddings. BYOK keys are encrypted on-device via Electron
  `safeStorage`, one per provider, never readable back by the renderer, and never sent to our
  backend by default. A signed-in user may separately enable passphrase-based E2E key sync;
  Chronicle stores only an opaque authenticated-encryption envelope and cannot decrypt it.
  Switching back to a configured provider does not require re-entry. No key for the
  annotation provider → versions still capture; summaries show *pending — configure AI in Settings*.
- Version 1 of an asset has no predecessor → the AI writes a **description** instead of a diff.
- The version's AI status is visible in the UI: *pending → done* or *failed (retry button)*.
- **The UI never waits for AI.** Versions appear instantly; the summary fills in when ready.
- **Offline rule:** jobs queue and run automatically when connectivity returns.
- The AI input/output format is fixed by C3. Prompt wording and orchestration are versioned implementation assets in `packages/prompts/` and evolve through research and testing.
- **Done when:** save a change → summary appears within seconds, correctly describing an obvious edit (color change, removed text); airplane-mode save → version shows "pending", summary arrives after reconnect.

### F5 — Timeline & version details `MVP`

- **Assets screen:** every tracked image with thumbnail, name, version count, last-change summary.
- **Timeline screen:** one asset's versions newest-first, each with thumbnail, version number, date, AI summary.
- **Details screen:** full preview, complete AI output (summary, changes, tags), metadata, and the **Restore** button.
- Keyboard-navigable; cached history and metadata work offline.
- **Done when:** a teammate who has never seen the app finds "what changed between v3 and v4" without help.

### F6 — Restore (rollback) `MVP`

- "Restore this version" copies that version's bytes back to the file's original path.
- **Restore never rewrites history** — the restored save is captured as a **new version** whose message is automatically "Restored from version N" (no AI call needed). Same philosophy as `git revert`.
- If the original folder no longer exists, offer "Save a copy…" instead.
- **Done when:** asset at v5 → restore v2 → file on disk is v2's content and the timeline shows v6 "Restored from version 2".

### F7 — Hybrid search `MVP`

- One search box over **all** assets' history. Two engines run together:
  - **Keyword:** matches AI summaries, tags, and file names.
  - **Semantic:** the *text* of each version's summary+tags is embedded (through the local AI service's LangChain embeddings, provider-agnostic); the query is embedded and compared by similarity — so "remove logo" finds "deleted the brand mark".
- Results are a single ranked list of **versions** (not just files); clicking opens the version's details.
- **Offline rule:** keyword search always works; semantic search needs embeddings that are computed asynchronously (queued like F4).
- **Done when:** demo script queries work — "version with the tagline" and "blue background" both land on the right version.

### F8 — Telemetry & admin stats `Low` (control plane — optional)

- Usage telemetry is **enabled by default** for signed-in and local profiles, with an adjacent warning that creative data remains local and a one-click off switch. This is default-enabled reporting, not an opt-in or affirmative consent, and the product must describe it honestly. New settings resolve it to `true`; existing profiles receive a one-time migration from the pre-POST-03 `false` placeholder that had no user-facing control. After that marker is stored, an explicit user choice of `false` is preserved.
- Local profiles use only their random installation UUID; telemetry does not silently create a Chronicle login account. Installation registration is a separately disclosed, minimal operation and continues even when usage telemetry is disabled.
- When enabled, the app reports allowlisted events — app opened, project/file/version counts, version captured, app version, supported file type, new-version count, AI summary generated (latency/provider), and search performed (never the query).
- **Privacy rule (hard):** telemetry contains **no file contents, no file names, no summaries** — only counts, sizes, file types, timings. This is one sentence in the demo: "we can see usage, we cannot see your work."
- Events queue offline and flush when online.
- Admins read aggregates via Swagger (`/docs`). *(Stretch: admin tab in the desktop app.)*
- **Done when:** after a demo run, an admin can answer "how many versions were captured today and how many AI calls did we make?"

### F9 — AI-inference gateway `Stretch`

- Backend endpoint that proxies the F4/F7 AI calls for users without their own key, implemented in `services/module/` behind the same functional input/output contract as the app. Its prompts and orchestration may differ.
- The app gets a provider setting: *"my own key"* (default, MVP) or *"Chronicle service"*.
- **Done when:** deleting the local API key and switching the setting still produces summaries.

### F10 — Admin tab · landing page `Stretch`

Only after everything above works. Landing page = marketing only, no product function.

### Explicitly out of scope (MVP)

Future formats (`.svg`, `.blend`, `.obj`, `.step`/`.stp`, `.psd`, `.psb`) are not part of the
MVP · Word/PDF remain out · rename/move tracking · side-by-side visual diff · branching · cloud
sync/collaboration · delta storage/compression · auto-updates · code signing · mobile/web clients.

---

## 5. Data at a Glance (entities, not schema)

The persistence behavior and domain data are contract-milestone deliverables. The exact
SQLite schema remains implementation-owned and evolves through migrations:

| Entity | Means | Key facts it holds |
|---|---|---|
| **Asset** | One tracked file (identity = path) | path, display name, created/last-seen, on-disk status |
| **Version** | One captured save of an asset | version number, content hash, timestamp, size, dimensions, AI status |
| **AI annotation** | The AI's output for a version | summary, changes, tags, provider used, latency |
| **Embedding** | Search vector for a version | the vector + which text produced it |
| **Tracked folder** | A folder/project the user watches | path, added date, display name, optional description, icon/color, excluded files, enabled extensions |
| **Queue item** | Pending offline work | job type (AI / embedding / telemetry), payload, retry count |

Backend keeps only: **User** (pre-built), **External identity**, **Installation**, revisioned **Account settings**, optional opaque **Encrypted secret**, and **Telemetry event** (POST-04, per F8 privacy rule) — all control-plane, all low priority.

---

## 6. Ways of Working — Best Practices

Rules for everyone, regardless of experience level:

1. **Contract-first at real boundaries.** Agree on operation functionality and input/output/error formats before independent components integrate. Prompts, databases, algorithms, and internal module structure are not contracts. API types are generated (`make generate-types`), never hand-written.
2. **Everything through PRs.** `main` is stable/releasable; `dev` is the shared integration branch; work happens on `feat/…`, `fix/…`, or `docs/…` branches created from `dev` and merged back by reviewed PR. Nobody pushes directly to `dev` or `main`. Keep PRs focused (one task/feature slice, ideally < ~300 lines).
3. **Definition of done** for any PR: typecheck + tests pass · generated types regenerated if the API changed · relevant doc updated if behavior changed · a line added to [bob-log.md](bob-log.md) describing how IBM Bob was used.
4. **Minimal code, library defaults.** No custom wrappers around LangChain, no clever abstractions. If a library does it, use the library's way. Under time pressure, boring beats elegant.
5. **AI is always async.** No UI action ever waits on a model response. If you find yourself blocking on AI, the design is wrong.
6. **Secrets never in git.** Keys live in `.env` (backend) or encrypted local storage (app). `.env.example` documents what's needed.
7. **Docs are a judged artifact.** README, this spec, and the Bob log are scored ("well-structured solution", "effective use of IBM Bob"). Update them as you go, not on Jul 30.
8. **Demo assets are test data.** We maintain one folder of demo images (logo, banner, product shot) and continuously test capture + AI + search against it — the video is rehearsed on these exact files.

---

## 7. Open Decisions (need an owner)

| Decision | Options / note | Needed by |
|---|---|---|
| Team roster & feature ownership | Fill the table in [CONSTRAINTS.md](challenge/CONSTRAINTS.md) | now |
| Final demo AI provider/budget | Gemini is the validated/configured default; formally approve account access, retention/cost assumptions, model IDs, and budget. Keep watsonx/Granite as a model-agnostic alignment option only if live-tested. | before MVP-12 |
| Design language | Resolved: dark-first neutral-gray pro tool, IBM blue actions/focus, paired light/system themes; validate against live demo data before release. | before MVP-12 |
| Demo asset pack | Generated logo/banner/product v1–v3 histories and commands exist in `demo-assets/`; team approval and end-to-end acceptance remain. | before MVP-12 |
| SkillsBuild activity | **Each member individually** — a missing certificate invalidates the whole submission | don't leave past Jul 25 |

---

## 8. Major Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **AI diff quality** — the demo's core beat produces a vague or wrong summary | Kills the wow moment | Keep the output contract stable while iterating on prompts, tools, deterministic analysis, and models against the exact demo images from day 1 |
| 2 | **Native module pain** — better-sqlite3 must be compiled for Electron; Windows needs build tools | Team members stuck on setup | Pin all versions; one person owns the scaffold and documents setup; fallback exists (WASM SQLite) if rebuilds fight us |
| 3 | **Watcher edge cases** — real editors (Photoshop et al.) write temp files, partial writes, atomic renames | Duplicate/missed versions in the live demo | The 2-second settle rule + ignore patterns; test with the actual editor used in the video, early |
| 4 | **Cloud-synced folders** (OneDrive/Dropbox) behave oddly with watchers | Flaky demo | Demo on a plain local folder; note the limitation |
| 5 | **Scope creep** — gateway, future formats, admin UI, landing | MVP slips past Jul 27 | Stretch labels in §4 are binding; MVP first, always |
| 6 | **Compliance misses** — SkillsBuild per member, Bob usage undocumented, video > 3 min | Submission invalid or loses the easiest points | Deadlines in §7; bob-log.md filled continuously; script the video from VISION.md |
| 7 | **API keys & cost** for demo/testing | Blocked AI testing | Decide provider(s) Jul 18; small shared test budget; BYOK design means any member's key works |
| 8 | **Python AI-service friction** — the demo machine needs Python 3.12 and the local service running for AI features | AI demo beat fails; teammates stuck on setup | App degrades gracefully by design (versions capture, jobs queue, UI shows *pending*); one documented start script; health check surfaced in the status bar; bundling the service into the installer is stretch |

---

## 9. Frequently Asked (answers for the team)

- **Do we use Docker?** Only for the backend, and the backend is optional: `docker compose up` runs Postgres, Redis, OPA, and the API in identical containers on every machine. The desktop app never uses Docker — Electron runs natively and SQLite is embedded. The **local AI service is also Docker-free**: a plain Python process (uvicorn) on `127.0.0.1`. The **entire MVP is developable and demoable without Docker** — you only need it when working on the lowest-priority control-plane features (accounts, telemetry, gateway).
- **Is the AI service the same as the FastAPI backend?** No. Both use FastAPI, which is the only thing they share. `services/ai/` is a **local, stateless sidecar of the desktop app** (annotations + embeddings, loopback-only, no database, no auth, required for AI features). `services/api/` is the **optional control plane** (accounts, telemetry, gateway) that runs in Docker with Postgres/Redis/OPA and is never required for the MVP.
- **Why not build on git instead of our own versioning?** We copy git's *design* (content-addressed storage, append-only history, revert-not-rewrite) but not the tool. Git gives no storage advantage for compressed images (they're full blobs either way), we need a queryable DB for AI summaries/tags/embeddings anyway, embedding git adds heavy dependencies and edge cases (`.git` folders in users' design folders, locking, users' own repos), and our whole versioning core is a few dozen lines — smaller than the git plumbing that would replace it.
- **How is the desktop app developed — in the browser?** No, but it feels like web dev. Electron = Chrome + Node.js bundled into one program: a **main process** (Node — watching, hashing, SQLite) and a **renderer** (the React UI inside a Chromium window), talking over a safe internal bridge (IPC). `npm run dev` in `apps/desktop/` opens a real desktop window with hot reload and Chrome DevTools; edits appear instantly. Production = `npm run build` + electron-builder → a normal `.exe`/`.dmg` installer (~100 MB, contains Chromium + Node + our code).
- **Where are past versions stored?** File bytes in Chronicle's library folder (content-addressed copies); everything else (metadata, AI text, vectors) in one local SQLite file. Not in Postgres — the backend never sees files.
- **Is SQLite enough?** Yes — ideal for local-first single-user apps. Our scale (thousands of versions) is trivial for it; FTS5 gives us built-in keyword search; brute-force vector similarity is milliseconds at our size (`sqlite-vec` is the upgrade path if that ever changes); and its only real weakness — many concurrent writers — doesn't apply to a one-process app. File bytes stay on disk, not in the DB. Precedent: Adobe Lightroom's entire catalog is a SQLite file. Multi-user sync (future) would live in the backend's Postgres, not here.
- **Is filesystem watching the same on Windows and macOS?** Yes for our code — chokidar abstracts the OS differences (Windows and macOS use different native mechanisms underneath). Windows is the primary dev/demo target; we smoke-test macOS.
- **Is the desktop app easy to demo/ship?** Demo: yes — `npm run dev` runs the full app; the video needs nothing more. Installers: electron-builder produces a Windows installer easily (stretch); macOS installers without an Apple signing certificate show a security warning — acceptable, judges watch the video and clone the repo.
- **Why is restore a new version instead of going back?** Never destroying history is the product's whole promise — and it's simpler to build.
