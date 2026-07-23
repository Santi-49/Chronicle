/**
 * C2 implementation — opens Chronicle's local SQLite database and applies the
 * implementation-owned schema (schema.sql).
 *
 * Electron-free on purpose: tests open databases in temporary directories.
 * The Electron entry point resolves the real user-data path (see index.ts).
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import schemaSql from './schema.sql?raw'

export type ChronicleDb = Database.Database

/** File name of the single local database inside the app data directory. */
export const DATABASE_FILE_NAME = 'chronicle.db'

/**
 * Opens (creating if needed) the database at `filePath` and applies the schema.
 *
 * Migration decision (MVP): schema.sql is fully idempotent (`IF NOT EXISTS`),
 * so it is re-applied on every startup. `CREATE TABLE IF NOT EXISTS` does not
 * add columns to a table that already exists, so additive columns are applied
 * separately by `ensureColumns` (also idempotent). `PRAGMA user_version` marks
 * the revision so a post-MVP release can switch to stepwise migrations.
 */
export function openChronicleDb(filePath: string): ChronicleDb {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new Database(filePath)
  // foreign_keys is per-connection in SQLite — it must be set on every open,
  // not only inside schema.sql.
  db.pragma('foreign_keys = ON')
  const previousVersion = db.pragma('user_version', { simple: true }) as number
  db.exec(schemaSql)
  // v2: presentation fields for tracked folders (C1 TrackedFolder). Existing
  // databases created at v1 lack these columns; add them without data loss.
  ensureColumns(db, 'tracked_folders', {
    display_name: "TEXT NOT NULL DEFAULT ''",
    icon: "TEXT NOT NULL DEFAULT 'folder'",
    color: "TEXT NOT NULL DEFAULT '#4589ff'",
  })
  // v3: per-folder tracking selection (C1 TrackedFolder excludedPaths/allowedExtensions).
  ensureColumns(db, 'tracked_folders', {
    excluded_paths: "TEXT NOT NULL DEFAULT '[]'",
    allowed_extensions: "TEXT NOT NULL DEFAULT '[]'",
  })
  // v4: optional user-authored project description.
  ensureColumns(db, 'tracked_folders', {
    description: "TEXT NOT NULL DEFAULT ''",
  })
  // v5: POST-04 random telemetry UUID per project (nullable, no default needed).
  ensureColumns(db, 'tracked_folders', {
    telemetry_id: 'TEXT',
  })
  // v6: failed AI jobs remain inspectable until the user explicitly retries.
  ensureColumns(db, 'queue_items', {
    status: "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','failed'))",
    last_error: 'TEXT',
  })
  if (previousVersion < 6) {
    // Releases before v6 deleted exhausted jobs. Reconstruct one failed
    // annotation job for each failed version so existing user work is
    // recoverable from Pending jobs after upgrade.
    db.exec(`
      INSERT INTO queue_items (job_type, payload, retry_count, status, last_error)
      SELECT
        'ai_annotation',
        json_object('versionId', versions.id),
        3,
        'failed',
        json_object(
          'message', 'This summary failed before Chronicle began retaining failed jobs.',
          'code', 'legacy_failure',
          'status', NULL
        )
      FROM versions
      WHERE versions.ai_status = 'failed'
        AND NOT EXISTS (
          SELECT 1
          FROM queue_items
          WHERE job_type = 'ai_annotation'
            AND json_extract(payload, '$.versionId') = versions.id
        );
    `)
  }
  db.pragma('user_version = 6')
  return db
}

/** Adds any missing columns to a table (idempotent). SQLite has no ADD COLUMN IF NOT EXISTS. */
function ensureColumns(db: ChronicleDb, table: string, columns: Record<string, string>): void {
  const existing = new Set(
    (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name),
  )
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
}
