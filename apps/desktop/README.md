# Chronicle Desktop

Local-first Electron app: watches folders, auto-versions creative files on save,
and explains what changed between versions with AI. See `docs/challenge/` for the
full product definition.

## Structure

```
src/main/       Electron main process (Node)
  watcher/        folder watching, debounce, ignore rules
  versioning/     hashing, content-addressed library, capture pipeline
  ipc/            C1 bridge: handlers, events, chronicle:// protocol, secrets
  ai/             job worker + typed client for the local Python AI service (services/ai/)
  gateway-client/ optional control-plane client (health, auth, installation/settings/key sync)
src/preload/    typed IPC bridge (contextBridge)
src/renderer/   React UI — Projects/Edit, Timeline, Version details, Search, Settings, jobs
```

## Commands

```bash
npm install        # once — also downloads Electron and rebuilds native modules
npm run ensure-electron # repairs/downloads the Electron binary if needed
npm run dev        # start Electron with hot reload
npm test           # Vitest, run under Electron's Node (same ABI as the app)
npm run build      # production bundle to out/
npm run package    # Windows installer to dist/
npm run typecheck  # tsc over main+preload and renderer
```

## Native modules (better-sqlite3)

`better-sqlite3` must match Electron's ABI, not system Node's. `postinstall`
runs `electron-rebuild` automatically (it downloads a prebuilt Electron binary;
Visual Studio Build Tools are only needed if that download ever fails and it
falls back to compiling). Because of this, `npm test` runs Vitest through
Electron's own Node runtime (`ELECTRON_RUN_AS_NODE`) so tests exercise the same
binary the app ships. If you ever see `NODE_MODULE_VERSION` errors, run
`npx electron-rebuild -f`.

## IPC bridge (C1) — implemented vs. pending

The preload exposes exactly `ChronicleBridge` (`src/shared/ipc.ts`) as
`window.chronicle`; behavior lives in `src/main/ipc/services.ts` (Electron-free,
tested), Electron glue in `src/main/ipc/register.ts`. Images reach the renderer
only as `chronicle://image/<hash>` URLs served from the library — never bytes or
filesystem paths. BYOK API keys are written via `safeStorage`, **one per
provider**, are never readable back over IPC, and never appear in `getSettings()`
— the renderer only learns which providers have a key (`configuredProviders`).

| C1 surface | Status |
|---|---|
| `listFolders` / `pickFolder` / `scanFolder` / `addFolder` / `updateFolder` / `removeFolder` (F2) | ✅ native picker, folder scan preview, presentation fields, per-folder tracking selection, live watching, plus confirmed removal that either retains history or permanently deletes project metadata/history and unshared blobs without touching originals |
| `listAssets` / `getTimeline` / `getVersionDetails` / `resetAssetHistory` (F5) | ✅ live history plus typed-safeguard reset of the latest snapshot to a freshly annotated v1 |
| `retryAnnotation` (F4) | ✅ re-queues; the AI worker itself is MVP-09 |
| `getSettings` / `updateSettings` / `setApiKey(provider,key)` / `clearApiKey(provider)` / `configuredProviders` (C5) | ✅ per-provider BYOK keys; both task selectors require a saved key, and changed provider/model pairs must pass the local AI service's live validation probe before persistence |
| `getAppStatus` / `listPendingJobs` + all five events (`versionCaptured`, `assetHistoryReset`, `annotationUpdated`, `statusChanged`, `fileSkipped`) | ✅ live status bar + renderer-safe FIFO queue |
| `getAccountState` / `logout` | ✅ always local mode for now |
| `restoreVersion` / `saveVersionCopy` (F6) | ✅ append-only restore, no restore AI job, native save-copy fallback when the original folder is gone |
| `search` (F7) | ✅ MVP-10 — hybrid FTS5 keyword + cosine-similarity semantic search, degrades gracefully to keyword-only when AI is unavailable |
| `register` / `login` (F1) | ⏳ low priority — rejects "not implemented yet" |

Changing the semantic-search provider or model queues all existing annotation text for
deduplicated asynchronous re-embedding. Stored and queried vectors use the same
provider-qualified model identity, so vectors from incompatible configurations are never mixed.

Unparseable image dimensions surface as `0×0` in `VersionDetails` (C1 declares
them non-nullable; capture stores `null` internally).

## AI provider setup (BYOK)

AI is model-agnostic (LangChain in `services/ai/`); the desktop app just ships a
default and lets you switch provider/model in **Settings → AI**. The validated
default (VALIDATE-01, 2026-07-21) is Google Gemini:

| Task | Default model | Notes |
|---|---|---|
| Change summaries | `gemini-flash-latest` | Vision + structured output. **Moving alias** — Google hot-swaps it each release (2-week breaking-change notice). Pin a dated Flash ID if you need a frozen demo. |
| Semantic search | `gemini-embedding-001` | 3,072-dimension text vectors (Google's only current text-embedding model). |

Setup for a fresh BYOK user:

1. Get a Google AI Studio key (`https://aistudio.google.com/apikey`).
2. In **Settings → AI**, keep the Google Gemini defaults (or pick another
   provider/model), paste the key, and Save. Save is blocked until each selected
   task has a saved key, and a changed provider/model is **live-probed** with the
   real task call before it persists — a rejected or unreachable pair rolls back.
3. Keys are stored per provider in Electron `safeStorage`, never readable back
   over IPC and never sent to Chronicle's backend by default.

Caveats worth stating in the demo (do not overclaim): the live probe and every
summary/embedding are **real provider calls** that leave the device and may incur
a small charge; cost estimates (≈$0.007–0.011/annotation for Flash) are
**approximate and dated**; and the free tier is used by Google to improve
products, so say the *creative library* stays local while naming the AI exception
— never "zero retention". Standalone-service defaults are configured via the
`CHRONICLE_AI_*` variables in `.env` (see repo-root `.env.example`).

## Where app data lives

Everything Chronicle persists is in Electron's per-user data directory
(`%APPDATA%\chronicle-desktop` in dev; `%APPDATA%\Chronicle` when installed):

- `chronicle.db` — SQLite metadata, AI text, embeddings, settings, queue
- `library/<first 2 hash chars>/<sha256>` — content-addressed version bytes

The user's tracked folders are never Chronicle storage — they are only read,
and written on restore.

## Styling

Tailwind CSS 4 is installed and wired via `@tailwindcss/vite`, but stays inert
until a stylesheet opts in with `@import "tailwindcss";` — the current UI uses
the hand-written token/stylesheet system in `src/renderer/src/styles/`. Adding
that import enables Tailwind's preflight reset, which will change existing
styles — a deliberate UI-owner decision, not a default.
