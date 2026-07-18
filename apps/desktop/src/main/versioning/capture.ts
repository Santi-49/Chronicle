/**
 * Version capture (MVP-04, spec F3) — turns an accepted watcher candidate
 * into a deduplicated, append-only asset version:
 *
 *   snapshot+hash (one streamed pass) → skip if identical to the latest
 *   version → read dimensions → create/append asset version → enqueue the
 *   AI annotation job (never awaited — F4/spec §6.5).
 *
 * Electron-free: callers pass the open database and the library root
 * (production: src/main/paths.ts `libraryDir()`; tests: temp dirs).
 */
import path from 'node:path'
import fs from 'node:fs'
import type { ChronicleDb } from '../db/database'
import {
  appendVersion,
  createAsset,
  enqueueJob,
  getAsset,
  getAssetByPath,
  getLatestVersion,
  setAssetOnDisk,
  type AssetRecord,
  type VersionRecord,
} from '../db/repositories'
import { MAX_FILE_BYTES } from '../watcher/rules'
import { snapshotToLibrary } from './library'
import { readImageDimensions } from './dimensions'

export type CaptureResult =
  /** A new version was appended (F3.4). */
  | { outcome: 'captured'; asset: AssetRecord; version: VersionRecord }
  /** Bytes identical to the asset's latest version — re-saves are free (F3.3). */
  | { outcome: 'unchanged'; asset: AssetRecord; version: VersionRecord }
  /** Nothing recorded. 'file-missing' also marks an existing asset off-disk. */
  | { outcome: 'skipped'; reason: 'file-missing' | 'too-large' }

/**
 * Captures against the same path are chained so a stale watcher event can
 * never race a fresh one into a duplicate version; different paths still
 * hash concurrently. (One-process app — in-memory chaining is enough.)
 */
const pathQueues = new Map<string, Promise<unknown>>()

function serializedByPath<T>(key: string, task: () => Promise<T>): Promise<T> {
  const tail = pathQueues.get(key) ?? Promise.resolve()
  const run = tail.then(task, task)
  const settled = run.catch(() => {})
  pathQueues.set(key, settled)
  void settled.then(() => {
    if (pathQueues.get(key) === settled) pathQueues.delete(key)
  })
  return run
}

/**
 * Captures one settled save. Never throws for the expected filesystem
 * outcomes (file vanished, over the size cap) — those come back as
 * `skipped` results the caller can surface.
 */
export function captureVersion(
  db: ChronicleDb,
  libraryRoot: string,
  filePath: string,
): Promise<CaptureResult> {
  const resolved = path.resolve(filePath)
  return serializedByPath(resolved, () => runCapture(db, libraryRoot, resolved))
}

async function runCapture(
  db: ChronicleDb,
  libraryRoot: string,
  resolved: string,
): Promise<CaptureResult> {
  // Defense in depth: the watcher already rejects oversized files (C4), but
  // capture re-checks so no other caller can bypass F3.6.
  let stats: fs.Stats
  try {
    stats = await fs.promises.stat(resolved)
  } catch {
    markFileMissing(db, resolved)
    return { outcome: 'skipped', reason: 'file-missing' }
  }
  if (stats.size > MAX_FILE_BYTES) return { outcome: 'skipped', reason: 'too-large' }

  let snapshot
  try {
    snapshot = await snapshotToLibrary(libraryRoot, resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      markFileMissing(db, resolved)
      return { outcome: 'skipped', reason: 'file-missing' }
    }
    throw error
  }

  const existing = getAssetByPath(db, resolved)
  if (existing) {
    const latest = getLatestVersion(db, existing.id)
    if (latest && latest.contentHash === snapshot.contentHash) {
      // Identical re-save: no version, but the file is demonstrably on disk.
      if (!existing.onDisk) setAssetOnDisk(db, existing.id, true)
      return { outcome: 'unchanged', asset: getAsset(db, existing.id)!, version: latest }
    }
  }

  // Dimensions come from the immutable library copy, never the still-editable
  // source, so metadata always describes exactly the stored bytes.
  const dimensions = await readImageDimensions(snapshot.libraryPath)

  const asset = existing ?? createAsset(db, resolved)
  // appendVersion + enqueueJob commit atomically (the nested transaction
  // becomes a savepoint), so a version can't exist without its queued AI job.
  const version = db.transaction(() => {
    const appended = appendVersion(db, {
      assetId: asset.id,
      contentHash: snapshot.contentHash,
      sizeBytes: snapshot.sizeBytes,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    })
    enqueueJob(db, 'ai_annotation', { versionId: appended.id })
    return appended
  })()

  return { outcome: 'captured', asset: getAsset(db, asset.id)!, version }
}

/**
 * F3.7 — a previously captured file disappeared from disk. History stays;
 * the asset is only flagged so the UI can say "file no longer on disk".
 * Unknown paths (e.g. a never-captured file deleted) are a no-op.
 */
export function markFileMissing(db: ChronicleDb, filePath: string): void {
  const asset = getAssetByPath(db, path.resolve(filePath))
  if (asset?.onDisk) setAssetOnDisk(db, asset.id, false)
}
