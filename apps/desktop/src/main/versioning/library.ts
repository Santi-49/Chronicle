/**
 * Content-addressed library (spec F3.5) — one file per distinct content,
 * stored as library/<hash first 2 chars>/<sha256 hex>. Identical bytes are
 * stored once, even across different assets.
 *
 * Electron-free on purpose (like db/): callers pass the library root, so
 * tests run against temp directories. The production root comes from
 * src/main/paths.ts and uses the same layout.
 */
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

export interface LibrarySnapshot {
  /** SHA-256 hex of the copied bytes. */
  contentHash: string
  sizeBytes: number
  /** Absolute path of the stored file inside the library. */
  libraryPath: string
  /** True when the content already existed (dedup — nothing new written). */
  alreadyStored: boolean
}

/** Destination for one version's bytes: <root>/<hash first 2 chars>/<hash>. */
export function libraryFilePathFor(libraryRoot: string, contentHash: string): string {
  return path.join(libraryRoot, contentHash.slice(0, 2), contentHash)
}

/**
 * Copies a file into the library, hashing it in the same single streamed
 * pass (F3.8 — no whole-file buffering, nothing on the UI path). The bytes
 * are written to a temp file first and renamed into place, so the stored
 * hash always matches the stored content even if the source keeps changing.
 */
export async function snapshotToLibrary(
  libraryRoot: string,
  sourcePath: string,
): Promise<LibrarySnapshot> {
  await fs.promises.mkdir(libraryRoot, { recursive: true })
  const tempPath = path.join(libraryRoot, `.snapshot-${randomUUID()}`)
  const hasher = createHash('sha256')
  let sizeBytes = 0

  try {
    await pipeline(
      fs.createReadStream(sourcePath),
      async function* (source) {
        for await (const chunk of source) {
          const bytes = chunk as Buffer
          hasher.update(bytes)
          sizeBytes += bytes.length
          yield bytes
        }
      },
      fs.createWriteStream(tempPath, { flags: 'wx' }),
    )

    const contentHash = hasher.digest('hex')
    const libraryPath = libraryFilePathFor(libraryRoot, contentHash)
    if (fs.existsSync(libraryPath)) {
      await fs.promises.rm(tempPath)
      return { contentHash, sizeBytes, libraryPath, alreadyStored: true }
    }

    await fs.promises.mkdir(path.dirname(libraryPath), { recursive: true })
    try {
      await fs.promises.rename(tempPath, libraryPath)
    } catch (error) {
      // Two captures of identical content can race the rename (Windows
      // refuses to replace). The content is there either way — that's a win.
      await fs.promises.rm(tempPath, { force: true })
      if (!fs.existsSync(libraryPath)) throw error
      return { contentHash, sizeBytes, libraryPath, alreadyStored: true }
    }
    return { contentHash, sizeBytes, libraryPath, alreadyStored: false }
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}
