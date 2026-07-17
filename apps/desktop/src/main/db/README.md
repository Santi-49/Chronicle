# db

SQLite persistence (C2 implementation): database open/init plus small repository
functions for folders, assets, versions, AI annotations, embeddings, the offline
queue, and settings. File bytes never enter SQLite — versions reference the
content-addressed library by hash.

- `database.ts` — Electron-free `openChronicleDb(filePath)`; tests use temp dirs.
- `index.ts` — `openAppDatabase()` resolves the Electron user-data path.
- `repositories.ts` — one small function per operation; multi-record writes are
  transactional (`appendVersion`, `saveAnnotation`).

**Migration decision (MVP):** `schema.sql` is idempotent (`IF NOT EXISTS`) and is
re-applied on every startup; `PRAGMA user_version = 1` marks the revision so a
post-MVP release can switch to stepwise migrations.

**Native module note:** `better-sqlite3` is rebuilt for Electron's ABI by
`postinstall` (`electron-rebuild`). `npm test` therefore runs Vitest through
Electron's own Node runtime (`ELECTRON_RUN_AS_NODE`) so tests exercise the same
binary the app ships.
