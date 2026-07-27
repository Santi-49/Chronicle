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
  if (previousVersion < 7) {
    // V2 usage statistics use a compact accumulator rather than v1 per-action
    // telemetry jobs. Old telemetry payloads do not match the new API contract.
    db.exec("DELETE FROM queue_items WHERE job_type = 'telemetry'")
  }
  if (previousVersion < 8) {
    db.transaction(() => {
      const trackingSince = new Date().toISOString()
      db.prepare(`
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('personal-analytics-tracking-since', json(?))
      `).run(JSON.stringify(trackingSince))
      // Backfill the durable activity Chronicle already knows. Search history
      // and per-call usage did not exist before v8 and therefore remain
      // explicitly partial rather than being guessed.
      db.exec(`
        INSERT INTO personal_activity (occurred_at, kind, asset_id)
        SELECT captured_at,
               CASE WHEN restored_from_version IS NULL THEN 'version-capture' ELSE 'restore' END,
               asset_id
        FROM versions;
        INSERT INTO personal_activity (occurred_at, kind, project_id)
        SELECT added_at, 'project-create', id FROM tracked_folders;
        INSERT INTO personal_activity (occurred_at, kind, asset_id)
        SELECT a.created_at, 'ai-summary', v.asset_id
        FROM ai_annotations a JOIN versions v ON v.id = a.version_id;
      `)
    })()
  }
  ensureColumns(db, 'ai_usage_calls', {
    pricing_source_url: 'TEXT',
    input_usd_per_million: 'REAL',
    output_usd_per_million: 'REAL',
  })
  // v9: removed files are retained for a bounded window instead of forever.
  ensureColumns(db, 'assets', { missing_since: 'TEXT' })
  if (previousVersion < 9) {
    // Releases before v9 recorded that a file was gone but not when. Start the
    // retention window at the upgrade rather than guessing a past date — an
    // invented timestamp could delete history the user still expects to see.
    db.prepare('UPDATE assets SET missing_since = ? WHERE on_disk = 0 AND missing_since IS NULL').run(
      new Date().toISOString(),
    )
  }
  db.pragma('user_version = 9')
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
