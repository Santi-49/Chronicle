/**
 * App data locations. Everything Chronicle persists lives in Electron's
 * per-user data directory (`%APPDATA%\<app>` on Windows):
 *
 *   chronicle.db            SQLite metadata (opened by src/main/db)
 *   library/<h2>/<hash>     content-addressed version bytes (written by versioning)
 *   previews/<h2>/<hash>.*  derived previews for formats the UI cannot decode
 *
 * The user's own tracked folders are never Chronicle storage — they are only
 * read, and written on restore (F6).
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Root of the content-addressed version library. */
export function libraryDir(): string {
  return path.join(app.getPath('userData'), 'library')
}

/** Root of the derived-preview cache (regenerable — safe to delete). */
export function previewDir(): string {
  return path.join(app.getPath('userData'), 'previews')
}

/** Destination for one version's bytes: library/<hash first 2 chars>/<hash>. */
export function libraryFilePath(contentHash: string): string {
  return path.join(libraryDir(), contentHash.slice(0, 2), contentHash)
}

/** Creates the app data directories on startup (idempotent). */
export function ensureAppDirs(): void {
  fs.mkdirSync(libraryDir(), { recursive: true })
  fs.mkdirSync(previewDir(), { recursive: true })
}
