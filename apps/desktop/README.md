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
  gateway-client/ control-plane client (auth, logs, stats, hosted inference)
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
| `listFolders` / `pickFolder` / `scanFolder` / `addFolder` / `updateFolder` / `removeFolder` (F2) | ✅ native picker, folder scan preview, presentation fields (displayName/description/icon/color), per-folder tracking selection (`excludedPaths`/`allowedExtensions`, enforced by the watcher), live watching |
| `listAssets` / `getTimeline` / `getVersionDetails` (F5) | ✅ |
| `retryAnnotation` (F4) | ✅ re-queues; the AI worker itself is MVP-09 |
| `getSettings` / `updateSettings` / `setApiKey(provider,key)` / `clearApiKey(provider)` / `configuredProviders` (C5) | ✅ per-provider BYOK keys (switch a task's provider without re-entering) |
| `getAppStatus` / `listPendingJobs` + all four events (`versionCaptured`, `annotationUpdated`, `statusChanged`, `fileSkipped`) | ✅ live status bar + renderer-safe FIFO queue |
| `getAccountState` / `logout` | ✅ always local mode for now |
| `restoreVersion` / `saveVersionCopy` (F6) | ⏳ MVP-07 — rejects "not implemented yet" |
| `search` (F7) | ⏳ MVP-10 — rejects "not implemented yet" |
| `register` / `login` (F1) | ⏳ low priority — rejects "not implemented yet" |

Unparseable image dimensions surface as `0×0` in `VersionDetails` (C1 declares
them non-nullable; capture stores `null` internally).

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
