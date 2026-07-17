# Chronicle Desktop

Local-first Electron app: watches folders, auto-versions creative files on save,
and explains what changed between versions with AI. See `docs/challenge/` for the
full product definition.

## Structure

```
src/main/       Electron main process (Node)
  watcher/        folder watching, debounce, ignore rules
  versioning/     hashing, SQLite, local file store
  ai/             LangChain comparison/summaries/tags (BYOK path)
  gateway-client/ control-plane client (auth, logs, stats, hosted inference)
src/preload/    typed IPC bridge (contextBridge)
src/renderer/   React UI — Assets, Timeline, Version details, Search
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
