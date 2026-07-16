# Chronicle — Team Spec: Tech Stack, Best Practices, Functionality

> **Status:** agreed 2026-07-16. This is the "same direction" document — read it before building anything.
> It defines **what** we build and **with which tools**, not **how** (no implementation here).
> Next step after this doc: contracts (DB schema, AI prompt contract, API types) → task board → self-assignment.

---

## 1. What We're Building (one paragraph)

**Chronicle** is a desktop app for designers. You point it at the folders where you work; every time you save an image (PNG/JPG in the MVP), Chronicle silently records that save as a **version** — like git commits, but automatic. An AI then writes the "commit message" for you: a plain-English summary of what changed ("background navy → teal; tagline removed") plus tags. The app shows each file's full version timeline, lets you **restore** any old version, and lets you **search your history by meaning** ("the one with the blue background"). Files never leave your machine, and the app **runs fully without Docker and without any API connection** — an optional backend adds accounts, usage stats, and (stretch) hosted AI calls, but nothing depends on it. Roadmap after images: design-industry formats like **CAD** — Word/PDF versioning already exists; architecture and product design have no unified version control.

---

## 2. Tech Stack — Complete List

Everything below is decided. Anything not listed here is **not** part of the stack — propose additions in a PR to this file.

### Desktop app (`apps/desktop/`) — the product

| Layer | Choice | Why |
|---|---|---|
| App shell | **Electron 38** + **electron-vite 4** | Desktop app with web tech; already scaffolded and verified |
| UI | **React 19 + TypeScript 5.9** | Team-known, typed |
| Styling | **Tailwind CSS 4** | Fast to build clean UI; no component library unless a real need appears |
| Local database | **SQLite** via **better-sqlite3** (runs inside the app, single file) | Zero-setup embedded DB; metadata, AI summaries, search index all in one file |
| File watching | **chokidar** | Battle-tested cross-platform watcher; same code on Windows and macOS |
| Hashing | Node.js built-in `crypto` (**SHA-256**) | Detects "did the content actually change"; no dependency |
| AI calls (local/BYOK path) | **LangChain.js**, model-agnostic, **default classes/methods only** | Team decision; provider swappable (Anthropic, watsonx/Granite, OpenAI…) |
| Embeddings storage | Vectors stored **in SQLite**, similarity computed in-process | Hundreds of versions ≠ vector DB territory; simplest thing that works |
| Packaging (stretch) | **electron-builder** | Produces a Windows installer for the demo if we want one; dev mode is fine for the video |

### Backend control plane (`services/api/` + `services/module/`) — pre-built, we extend · **lowest priority (non-essential)**

| Layer | Choice | Why |
|---|---|---|
| API | **FastAPI (Python 3.12)** + Postgres 16 + Redis 7 + OPA | Already built: register/login/JWT/refresh/logout, RBAC, user CRUD |
| New endpoints we add | telemetry/stats, account config, *(stretch)* AI-inference gateway | See §4 F8/F9 |
| AI calls (gateway path, stretch) | **LangChain (Python)**, same model-agnostic rule | Mirrors the app's AI layer behind the service |
| Migrations | Alembic (`make makemigration`) | Template standard |

### Landing page (`apps/landing/`) — optional

| Layer | Choice |
|---|---|
| Framework | **Astro** (static) → Cloudflare Pages — build only if time remains after MVP |

### Cross-cutting

| Concern | Choice |
|---|---|
| Contracts | Python `Protocol` (`packages/contracts/module/`) + OpenAPI → generated TS types (`make generate-types`). **Never hand-write API types.** |
| Testing | **Vitest** for desktop logic (hashing, version rules, search ranking) · **pytest** for backend (already 32 tests) |
| Lint/format | **ESLint + Prettier** (TS) · **Ruff** (Python) |
| Dev tool | **IBM Bob** — mandatory, judged. Every member logs usage in [bob-log.md](bob-log.md) |
| Runtimes | Node 20+, Python 3.12, Docker Desktop (backend only) |

### One important subtlety: LangChain exists twice

LangChain has a JavaScript version and a Python version. We use **both**, one per side of the wire:

- **In the app (MVP):** LangChain.js makes the AI call directly with the user's own API key ("bring your own key" / BYOK). The key is stored encrypted on the user's machine and **never sent to our backend**.
- **In the backend (stretch):** LangChain Python behind a gateway endpoint, for users without a key.

Both sides implement the **same prompt contract** (one shared spec file in `packages/contracts/` — defined at the contracts milestone), so the AI behaves identically regardless of path.

---

## 3. Where Everything Lives (plain-language architecture)

**On the user's machine (everything about their files):**

- **The user's own folders** — untouched. Chronicle only *reads* them (and writes on restore).
- **Chronicle's library** — a folder in the app's data directory holding a copy of every version's file bytes, stored under its content hash. Identical content is stored **once**, even across different files (free deduplication). Originals, no compression, no deltas.
- **Chronicle's database** — one SQLite file next to the library: assets, versions, AI summaries, tags, embeddings, settings, and the offline queue.

**On our backend (never any file content) — optional, lowest priority.** The app is fully usable account-less ("Continue local" at startup); an account only adds telemetry/stats and (stretch) hosted inference:

- Accounts (register/login — the pre-built JWT stack).
- Account config (small JSON: preferred AI provider, telemetry opt-in). The BYOK API key is **not** part of it.
- Telemetry events and aggregated stats (see F8 for the exact privacy rule).
- *(Stretch)* the AI-inference gateway.

**Admin stats surface (decision):** admins consume stats through the API's built-in **Swagger UI** (`/docs`) — zero UI to build for the MVP. If time remains, an **Admin tab inside the desktop app** (visible only to the `admin` role, which RBAC already supports). We deliberately do **not** build a separate web app — we deleted it to avoid distraction.

---

## 4. Functionality — MVP Spec

Each feature states its rules and a "done when" test. **Scope labels:** `MVP` must ship by Jul 27 · `Low` = control-plane features — non-essential (the app fully works without them), build **last** · `Stretch` only after everything else works.

> UI surface for every feature: [desktop/overview.md](desktop/overview.md) — pages, layout, startup flow.

### F1 — Accounts & sign-in `Low` (control plane — optional)

- On first launch the app offers two paths: **"Continue local"** (default — no account, no network, fully functional forever) or **"Log in / Register"** (against our backend).
- An account can be linked later from Settings; signing in never gates a local feature — it only enables telemetry (F8) and the gateway option (F9).
- If signed in: the session persists across restarts; token refresh is automatic (pre-built stack). Signing in requires internet **once**; after that everything except AI calls and telemetry works offline (those queue — see F4/F8).
- **Hard rule:** the app runs with **no Docker setup and no API connection** — the whole MVP is developable and demoable without ever starting the backend.
- **Done when:** fresh install → "Continue local" → capture, timeline, restore, and search all work with no network and no backend running; register later from Settings → telemetry starts flowing; close and reopen → state (local or signed-in) is remembered.

### F2 — Tracked folders `MVP`

- The user adds/removes folders to track from a Settings screen; the list persists locally.
- Watching is recursive (subfolders included).
- Only `.png`, `.jpg`, `.jpeg` files count (case-insensitive). Other formats are ignored — the UI lists design-industry formats (e.g. **CAD**: DWG/DXF) as "coming soon". **Roadmap rationale:** images first, then architecture/design-software files — Word/PDF versioning already exists, while the creative/design industries have no unified version control system.
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
- **Done when:** edit + save an image 3 times → exactly 3 versions with correct numbering; save with no visual change but identical bytes → no version; version appears < 5 s after the save settles.

### F4 — AI change summary (the "commit message") `MVP`

- When a new version is captured, an **async job** sends the *previous* image + *new* image (plus filename) to a vision-capable model via LangChain and receives structured output: **summary** (1 sentence), **changes** (bullet list), **tags** (3–8 lowercase keywords).
- The AI connection is configured in **Settings → AI**: provider, model, and API key (BYOK — stored encrypted on-device via Electron `safeStorage`, never sent to our backend). No key configured → versions still capture; summaries show *pending — configure AI in Settings*.
- Version 1 of an asset has no predecessor → the AI writes a **description** instead of a diff.
- The version's AI status is visible in the UI: *pending → done* or *failed (retry button)*.
- **The UI never waits for AI.** Versions appear instantly; the summary fills in when ready.
- **Offline rule:** jobs queue and run automatically when connectivity returns.
- The exact prompt wording and output schema are fixed in the **AI prompt contract** (contracts milestone, Jul 18) — one shared spec used by both the app (BYOK) and the gateway.
- **Done when:** save a change → summary appears within seconds, correctly describing an obvious edit (color change, removed text); airplane-mode save → version shows "pending", summary arrives after reconnect.

### F5 — Timeline & version details `MVP`

- **Assets screen:** every tracked image with thumbnail, name, version count, last-change summary.
- **Timeline screen:** one asset's versions newest-first, each with thumbnail, version number, date, AI summary.
- **Details screen:** full preview, complete AI output (summary, changes, tags), metadata, and the **Restore** button.
- Keyboard-navigable; works fully offline.
- **Done when:** a teammate who has never seen the app finds "what changed between v3 and v4" without help.

### F6 — Restore (rollback) `MVP`

- "Restore this version" copies that version's bytes back to the file's original path.
- **Restore never rewrites history** — the restored save is captured as a **new version** whose message is automatically "Restored from version N" (no AI call needed). Same philosophy as `git revert`.
- If the original folder no longer exists, offer "Save a copy…" instead.
- **Done when:** asset at v5 → restore v2 → file on disk is v2's content and the timeline shows v6 "Restored from version 2".

### F7 — Hybrid search `MVP`

- One search box over **all** assets' history. Two engines run together:
  - **Keyword:** matches AI summaries, tags, and file names.
  - **Semantic:** the *text* of each version's summary+tags is embedded (via LangChain embeddings, provider-agnostic); the query is embedded and compared by similarity — so "remove logo" finds "deleted the brand mark".
- Results are a single ranked list of **versions** (not just files); clicking opens the version's details.
- **Offline rule:** keyword search always works; semantic search needs embeddings that are computed asynchronously (queued like F4).
- **Done when:** demo script queries work — "version with the tagline" and "blue background" both land on the right version.

### F8 — Telemetry & admin stats `Low` (control plane — optional)

- Only when signed in (F1) and opted in: the app reports events to the backend — app opened, version captured, AI summary generated (latency, provider), search performed. In local mode, nothing is sent, ever.
- **Privacy rule (hard):** telemetry contains **no file contents, no file names, no summaries** — only counts, sizes, file types, timings. This is one sentence in the demo: "we can see usage, we cannot see your work."
- Events queue offline and flush when online.
- Admins read aggregates via Swagger (`/docs`). *(Stretch: admin tab in the desktop app.)*
- **Done when:** after a demo run, an admin can answer "how many versions were captured today and how many AI calls did we make?"

### F9 — AI-inference gateway `Stretch`

- Backend endpoint that proxies the F4/F7 AI calls for users without their own key, implemented in `services/module/` behind the module contract, using the **same prompt contract** as the app.
- The app gets a provider setting: *"my own key"* (default, MVP) or *"Chronicle service"*.
- **Done when:** deleting the local API key and switching the setting still produces summaries.

### F10 — Admin tab · landing page `Stretch`

Only after everything above works. Landing page = marketing only, no product function.

### Explicitly out of scope (MVP)

Non-image formats (CAD is the *next* target, not the MVP; Word/PDF are permanently out — that problem is already solved) · rename/move tracking · side-by-side visual diff · branching · cloud sync/collaboration · delta storage/compression · auto-updates · code signing · mobile/web clients.

---

## 5. Data at a Glance (entities, not schema)

The exact SQLite schema is a contracts-milestone deliverable (Jul 18). The entities and their meaning are fixed now:

| Entity | Means | Key facts it holds |
|---|---|---|
| **Asset** | One tracked file (identity = path) | path, display name, created/last-seen, on-disk status |
| **Version** | One captured save of an asset | version number, content hash, timestamp, size, dimensions, AI status |
| **AI annotation** | The AI's output for a version | summary, changes, tags, provider used, latency |
| **Embedding** | Search vector for a version | the vector + which text produced it |
| **Tracked folder** | A folder the user watches | path, added date |
| **Queue item** | Pending offline work | job type (AI / embedding / telemetry), payload, retry count |

Backend keeps only: **User** (pre-built), **Account config** (JSON blob per user), **Telemetry event** (per F8 privacy rule) — all control-plane, all low priority.

---

## 6. Ways of Working — Best Practices

Rules for everyone, regardless of experience level:

1. **Contract-first.** Anything that crosses a boundary (app ↔ backend, backend ↔ module, prompt ↔ model) gets its contract agreed **before** implementation. Contracts live in `packages/contracts/`; API types are generated (`make generate-types`), never hand-written.
2. **Everything through PRs.** Branch from `main` (`feat/…`, `fix/…`, `docs/…`), keep PRs small (one feature slice, ideally < ~300 lines), at least **one review** before merge. Nobody pushes to `main` directly.
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
| Default demo AI provider | Recommend: a strong vision model (e.g. Claude) as primary, **watsonx/Granite configured as the swap** to prove model-agnosticism and score IBM points | Jul 18 |
| Design language | Colors/fonts/style TBD — run the design-skill search before UI work; working assumption: dark "pro tool" (Linear/Figma-like) | before first UI PR |
| Demo asset pack | Who creates the logo/banner/product-shot set + the scripted edits | Jul 20 |
| SkillsBuild activity | **Each member individually** — a missing certificate invalidates the whole submission | don't leave past Jul 25 |

---

## 8. Major Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **AI diff quality** — the demo's core beat produces a vague or wrong summary | Kills the wow moment | Lock the prompt contract early; test on the exact demo images from day 1; structured output with validation; pick the strongest vision model as default |
| 2 | **Native module pain** — better-sqlite3 must be compiled for Electron; Windows needs build tools | Team members stuck on setup | Pin all versions; one person owns the scaffold and documents setup; fallback exists (WASM SQLite) if rebuilds fight us |
| 3 | **Watcher edge cases** — real editors (Photoshop et al.) write temp files, partial writes, atomic renames | Duplicate/missed versions in the live demo | The 2-second settle rule + ignore patterns; test with the actual editor used in the video, early |
| 4 | **Cloud-synced folders** (OneDrive/Dropbox) behave oddly with watchers | Flaky demo | Demo on a plain local folder; note the limitation |
| 5 | **Scope creep** — gateway, CAD, admin UI, landing | MVP slips past Jul 27 | Stretch labels in §4 are binding; MVP first, always |
| 6 | **Compliance misses** — SkillsBuild per member, Bob usage undocumented, video > 3 min | Submission invalid or loses the easiest points | Deadlines in §7; bob-log.md filled continuously; script the video from VISION.md |
| 7 | **API keys & cost** for demo/testing | Blocked AI testing | Decide provider(s) Jul 18; small shared test budget; BYOK design means any member's key works |

---

## 9. Frequently Asked (answers for the team)

- **Do we use Docker?** Only for the backend, and the backend is optional: `docker compose up` runs Postgres, Redis, OPA, and the API in identical containers on every machine. The desktop app never uses Docker — Electron runs natively and SQLite is embedded. The **entire MVP is developable and demoable without Docker** — you only need it when working on the lowest-priority control-plane features (accounts, telemetry, gateway).
- **Why not build on git instead of our own versioning?** We copy git's *design* (content-addressed storage, append-only history, revert-not-rewrite) but not the tool. Git gives no storage advantage for compressed images (they're full blobs either way), we need a queryable DB for AI summaries/tags/embeddings anyway, embedding git adds heavy dependencies and edge cases (`.git` folders in users' design folders, locking, users' own repos), and our whole versioning core is a few dozen lines — smaller than the git plumbing that would replace it.
- **How is the desktop app developed — in the browser?** No, but it feels like web dev. Electron = Chrome + Node.js bundled into one program: a **main process** (Node — watching, hashing, SQLite) and a **renderer** (the React UI inside a Chromium window), talking over a safe internal bridge (IPC). `npm run dev` in `apps/desktop/` opens a real desktop window with hot reload and Chrome DevTools; edits appear instantly. Production = `npm run build` + electron-builder → a normal `.exe`/`.dmg` installer (~100 MB, contains Chromium + Node + our code).
- **Where are past versions stored?** File bytes in Chronicle's library folder (content-addressed copies); everything else (metadata, AI text, vectors) in one local SQLite file. Not in Postgres — the backend never sees files.
- **Is SQLite enough?** Yes — ideal for local-first single-user apps. Our scale (thousands of versions) is trivial for it; FTS5 gives us built-in keyword search; brute-force vector similarity is milliseconds at our size (`sqlite-vec` is the upgrade path if that ever changes); and its only real weakness — many concurrent writers — doesn't apply to a one-process app. File bytes stay on disk, not in the DB. Precedent: Adobe Lightroom's entire catalog is a SQLite file. Multi-user sync (future) would live in the backend's Postgres, not here.
- **Is filesystem watching the same on Windows and macOS?** Yes for our code — chokidar abstracts the OS differences (Windows and macOS use different native mechanisms underneath). Windows is the primary dev/demo target; we smoke-test macOS.
- **Is the desktop app easy to demo/ship?** Demo: yes — `npm run dev` runs the full app; the video needs nothing more. Installers: electron-builder produces a Windows installer easily (stretch); macOS installers without an Apple signing certificate show a security warning — acceptable, judges watch the video and clone the repo.
- **Why is restore a new version instead of going back?** Never destroying history is the product's whole promise — and it's simpler to build.
