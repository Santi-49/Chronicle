/**
 * Electron entry for the database module: resolves the real app-data location.
 * Everything else in this folder is Electron-free and unit-testable.
 */
import { app } from 'electron'
import path from 'node:path'
import { DATABASE_FILE_NAME, openChronicleDb, type ChronicleDb } from './database'

export * from './database'
export * from './repositories'

/** Opens Chronicle's database in the Electron user-data directory. */
export function openAppDatabase(): ChronicleDb {
  return openChronicleDb(path.join(app.getPath('userData'), DATABASE_FILE_NAME))
}
