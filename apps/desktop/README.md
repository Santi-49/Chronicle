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
npm install        # once
npm run ensure-electron # repairs/downloads the Electron binary if needed
npm run dev        # start Electron with hot reload
npm run build      # production bundle to out/
npm run package    # Windows installer to dist/
npm run typecheck  # tsc over main+preload and renderer
```
