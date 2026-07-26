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
npm run package:windows:publish # CI-only: package and publish updater assets
npm run package:mac # native-architecture macOS DMG to dist/ (must run on macOS)
npm run package:unpacked # faster runnable build without creating the NSIS installer
npm run typecheck  # tsc over main+preload and renderer
```

Packaging requires Python 3.12 or newer; the build creates an isolated
`services/ai[providers,bundle]` environment automatically. `make package`
installs that build dependency automatically. The generated Windows and macOS installers bundle a self-contained
Gemini/OpenAI/Anthropic sidecar under Electron resources; an installed user does not need Python.
Run `python ../../scripts/smoke_ai_sidecar.py` after packaging to probe the actual executable.
For normal implementation work, use `make package-unpacked`; reserve `make package` for testing the
actual installer. The installer build must restage Electron and create the NSIS archive, so it is
substantially slower even when the Python bundle cache is warm.

The installers are unsigned: Windows SmartScreen may warn, while macOS Gatekeeper requires an
explicit user override. The installed Windows app checks the public stable GitHub Releases feed
after startup and periodically while open. It downloads newer releases in the background, but
never applies one on an ordinary quit. Download discovery and progress stay out of the global
shell; once ready, a compact notice above **Settings** offers **Restart to update**, **Later** for
the current session, or **Ignore** for that release. The same restart action remains available in
**Settings → About & updates**. Automatic network failures stay silent; **Check now** shows
recoverable status. Development, unpacked, macOS, and Linux builds make no update request.
The first updater-capable version must still be installed manually; only a later release can prove
the automatic upgrade path. Update requests contain no Chronicle content, paths, credentials, or
account payload, although GitHub/CDN receives normal connection metadata.

Amazon Bedrock is not offered
because AWS requires multiple credential fields and a region rather than Chronicle's current
single encrypted key per provider. Windows code signing, Apple notarization, macOS auto-update,
and remotely enforced mandatory security updates remain gated follow-up work. The unsigned feed
supports optional/recommended updates only.

The Windows `.exe` uses the native electron-builder assisted NSIS wizard—no custom HTML and no
replacement installer script. Chronicle supplies a 150×57 header and 164×314 sidebar (24-bit BMP),
short native Welcome/Finish copy, an editable destination, and a current-user install that avoids
an unnecessary administrator prompt. `build/installer.nsh` also declares NSIS's required license
checkbox mode, but no license page is configured. Chronicle instead presents links to the hosted
Terms of Service and Privacy Policy beside the actions that enter the app. Continuing records the
document versions, timestamp, and continuation method on that device; Settings keeps both links
available. A human legal review may still require a separate installer license later.
The link origin is compiled from `CHRONICLE_LANDING_URL` (defaulting to the current production
site); release workflows read it from the same-named GitHub Actions repository variable.

On a genuinely fresh profile, launching Chronicle and continuing locally (or signing in) opens a
resumable three-step tutorial over the real workspace: create a project, open an asset Timeline,
then configure/test an optional AI provider or defer it. The tutorial never blocks local capture,
stores no paths or keys, uses coach-mark dialogs to point at the real controls, can be skipped,
and can be replayed from
**Settings → Getting started**.

When the effective Terms or Privacy version constants change, an upgraded profile returns to a
short review screen once. Accepting it preserves the existing tutorial state. This record is
device-local; Chronicle does not currently claim server-side account acceptance evidence.

## CI, versions, and releases

`package.json` is the desktop version source of truth; electron-builder, the sidebar, installation
registration, artifact names, and Git tags derive from it. CI is a required check only on pull
requests targeting `main`. Tagged releases build and attach versioned Windows x64 and macOS Apple
Silicon artifacts. Release
Please maintains a reviewed release PR; merging it creates `vX.Y.Z`, and the release workflow
builds that exact tag. The Windows job publishes the NSIS installer, `latest.yml`, and blockmap
together, validates the manifest version and SHA-512 against local and published assets, and then
attaches the human-readable SHA-256 checksum. macOS continues to attach its DMG and checksum.

Configure a fine-grained `RELEASE_PLEASE_TOKEN` repository secret with Contents and Pull requests
write access so Release Please PRs trigger the required `main` PR CI. See
[`docs/releasing.md`](../../docs/releasing.md) for the bump policy and repository settings.

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
