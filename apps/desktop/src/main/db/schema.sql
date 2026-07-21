-- Chronicle local database implementation (SQLite, one file in the app data dir).
-- This schema is implementation-owned, not a cross-component contract. Change it
-- through migrations and verify repository/query behavior against public contracts.
--
-- Conventions: dates are ISO-8601 TEXT (UTC) · JSON goes in TEXT columns ·
-- file bytes are NEVER stored here — they live in the content-addressed
-- library folder as library/<hash first 2 chars>/<hash>.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- F2 — folders the user watches. display_name/description/icon/color are renderer
-- presentation fields (C1 TrackedFolder); watching behavior ignores them.
CREATE TABLE IF NOT EXISTS tracked_folders (
  id            INTEGER PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,
  added_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  display_name  TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  icon          TEXT NOT NULL DEFAULT 'folder',
  color         TEXT NOT NULL DEFAULT '#4589ff',
  -- JSON arrays. excluded_paths: absolute file paths the watcher must skip.
  -- allowed_extensions: enabled extensions; '[]' means "all supported types".
  excluded_paths      TEXT NOT NULL DEFAULT '[]',
  allowed_extensions  TEXT NOT NULL DEFAULT '[]'
);

-- One tracked file. Identity = path (MVP, spec F3.7): rename/move = new asset.
CREATE TABLE IF NOT EXISTS assets (
  id            INTEGER PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,               -- file name without directory
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT,
  on_disk       INTEGER NOT NULL DEFAULT 1   -- 0 = deleted from disk, history kept (F3.7)
);

-- F3 — one captured save
CREATE TABLE IF NOT EXISTS versions (
  id                     INTEGER PRIMARY KEY,
  asset_id               INTEGER NOT NULL REFERENCES assets(id),
  version_number         INTEGER NOT NULL,   -- 1..N; normal capture is append-only, explicit reset rebuilds v1
  content_hash           TEXT NOT NULL,      -- sha256 hex; key into the library folder
  captured_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  size_bytes             INTEGER NOT NULL,
  width                  INTEGER,
  height                 INTEGER,
  ai_status              TEXT NOT NULL DEFAULT 'pending'
                         CHECK (ai_status IN ('pending','done','failed','none')),
  restored_from_version  INTEGER,            -- version_number it restores (F6); ai_status = 'none'
  UNIQUE (asset_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_versions_asset ON versions(asset_id);
CREATE INDEX IF NOT EXISTS idx_versions_hash  ON versions(content_hash);

-- F4 — AI output for a version (shape fixed by packages/contracts/ai/)
CREATE TABLE IF NOT EXISTS ai_annotations (
  version_id  INTEGER PRIMARY KEY REFERENCES versions(id),
  summary     TEXT NOT NULL,
  changes     TEXT NOT NULL,                 -- JSON array of strings
  tags        TEXT NOT NULL,                 -- JSON array of strings
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  latency_ms  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- F7 — semantic search vector (the source-text construction is chosen and
-- versioned by the search implementation, not fixed by a contract)
CREATE TABLE IF NOT EXISTS embeddings (
  version_id   INTEGER PRIMARY KEY REFERENCES versions(id),
  vector       BLOB NOT NULL,                -- float32 array, little-endian
  source_text  TEXT NOT NULL,                -- exactly what was embedded
  model        TEXT NOT NULL                 -- vectors comparable only within one model
);

-- F7 — keyword search (FTS5). Denormalized on purpose; rows written when an
-- annotation lands and when an asset is renamed on disk.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  version_id UNINDEXED,
  asset_name,
  summary,
  changes,
  tags
);

-- F4/F7/F8 — offline queue, processed FIFO by the job runner
CREATE TABLE IF NOT EXISTS queue_items (
  id           INTEGER PRIMARY KEY,
  job_type     TEXT NOT NULL CHECK (job_type IN ('ai_annotation','embedding','telemetry')),
  payload      TEXT NOT NULL,                -- JSON, job-type specific
  retry_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- C5 — settings persistence (JSON per key). Secrets NEVER go here:
-- API key and auth tokens live in Electron safeStorage (see settings.ts).
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL                       -- JSON
);
