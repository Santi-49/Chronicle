/** Append-only restore and save-copy operations (F6 / MVP-07). */
import fs from 'node:fs'
import path from 'node:path'
import type { ChronicleDb } from '../db/database'
import { appendVersion, getAsset, getVersion, type VersionRecord } from '../db/repositories'
import { libraryFilePathFor } from './library'
import { serializedByPath } from './operation-queue'

export type RestoreVersionResult =
  | { outcome: 'restored'; version: VersionRecord }
  | { outcome: 'folder-missing' }

function versionAndAsset(db: ChronicleDb, versionId: number) {
  const source = getVersion(db, versionId)
  if (!source) throw new Error(`Unknown version: ${versionId}`)
  const asset = getAsset(db, source.assetId)
  if (!asset) throw new Error(`Asset for version ${versionId} no longer exists`)
  return { source, asset }
}

/**
 * Writes the selected immutable snapshot to its original path and appends a
 * provenance-only version. Restore versions deliberately enqueue no AI work.
 */
export async function restoreVersion(
  db: ChronicleDb,
  libraryRoot: string,
  versionId: number,
): Promise<RestoreVersionResult> {
  const { source, asset } = versionAndAsset(db, versionId)
  const targetPath = path.resolve(asset.path)

  return serializedByPath(targetPath, async () => {
    let parent
    try {
      parent = await fs.promises.stat(path.dirname(targetPath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { outcome: 'folder-missing' }
      throw error
    }
    if (!parent.isDirectory()) return { outcome: 'folder-missing' }

    await fs.promises.copyFile(libraryFilePathFor(libraryRoot, source.contentHash), targetPath)
    const version = appendVersion(db, {
      assetId: asset.id,
      contentHash: source.contentHash,
      sizeBytes: source.sizeBytes,
      width: source.width,
      height: source.height,
      aiStatus: 'none',
      restoredFromVersion: source.versionNumber,
    })
    return { outcome: 'restored', version }
  })
}

/** Copies immutable version bytes to a user-selected path without changing history. */
export async function saveVersionCopy(
  db: ChronicleDb,
  libraryRoot: string,
  versionId: number,
  destinationPath: string,
): Promise<void> {
  const { source } = versionAndAsset(db, versionId)
  await fs.promises.copyFile(
    libraryFilePathFor(libraryRoot, source.contentHash),
    path.resolve(destinationPath),
  )
}
