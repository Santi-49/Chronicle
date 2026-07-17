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
 * so it is re-applied on every startup. `PRAGMA user_version = 1` marks the
 * revision so a post-MVP release can switch to stepwise migrations.
 */
export function openChronicleDb(filePath: string): ChronicleDb {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new Database(filePath)
  // foreign_keys is per-connection in SQLite — it must be set on every open,
  // not only inside schema.sql.
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)
  db.pragma('user_version = 1')
  return db
}
