/**
 * Derived-preview cache.
 *
 * Formats Chromium cannot decode (PSD, PSB, OBJ, BLEND) need a displayable
 * image. Previews are generated lazily the first time the renderer requests
 * one and cached beside the library under the same content hash, so identical
 * bytes are converted once no matter how many assets or versions share them.
 *
 * Lazy generation keeps this off the capture path entirely: capture stays a
 * hash-and-store operation, and the renderer's image request is already
 * asynchronous. Generation for a hash is deduplicated, and a format that
 * yields no preview is remembered so a repeated request is cheap.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FormatId } from '../../shared/formats'
import { createFormatPreview } from './index'
import { libraryFilePathFor } from '../versioning/library'
import type { DerivedPreview } from './io'

const EXTENSION: Record<DerivedPreview['mediaType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
}

export interface CachedPreview {
  filePath: string
  mediaType: DerivedPreview['mediaType']
}

/** Where a format's preview for one content hash lives. */
function cachePathFor(
  previewRoot: string,
  contentHash: string,
  format: FormatId,
  mediaType: DerivedPreview['mediaType'],
): string {
  return path.join(previewRoot, contentHash.slice(0, 2), `${contentHash}.${format}.${EXTENSION[mediaType]}`)
}

/** In-flight generations, so concurrent requests do the work once. */
const pending = new Map<string, Promise<CachedPreview | null>>()
/** Hashes already known to produce no preview (missing thumbnail, no geometry). */
const unavailable = new Set<string>()

export interface PreviewCacheOptions {
  libraryRoot: string
  previewRoot: string
}

/**
 * Return a cached preview, generating it if needed. Returns null when the
 * format has no generator, the stored bytes carry no usable preview, or
 * generation failed — all of which the caller serves as 404 so the UI falls
 * back to the format placeholder.
 */
export async function resolvePreview(
  options: PreviewCacheOptions,
  contentHash: string,
  format: FormatId,
): Promise<CachedPreview | null> {
  const key = `${format}:${contentHash}`
  if (unavailable.has(key)) return null

  const existing = await findCached(options.previewRoot, contentHash, format)
  if (existing) return existing

  const inFlight = pending.get(key)
  if (inFlight) return inFlight

  const generation = generate(options, contentHash, format)
    .then((result) => {
      if (result === null) unavailable.add(key)
      return result
    })
    .finally(() => pending.delete(key))
  pending.set(key, generation)
  return generation
}

async function findCached(
  previewRoot: string,
  contentHash: string,
  format: FormatId,
): Promise<CachedPreview | null> {
  for (const mediaType of Object.keys(EXTENSION) as DerivedPreview['mediaType'][]) {
    const filePath = cachePathFor(previewRoot, contentHash, format, mediaType)
    if (await exists(filePath)) return { filePath, mediaType }
  }
  return null
}

async function generate(
  options: PreviewCacheOptions,
  contentHash: string,
  format: FormatId,
): Promise<CachedPreview | null> {
  const source = libraryFilePathFor(options.libraryRoot, contentHash)
  const preview = await createFormatPreview(source, format)
  if (!preview) return null

  const filePath = cachePathFor(options.previewRoot, contentHash, format, preview.mediaType)
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    // Write-then-rename so a reader never sees a half-written preview.
    const temporary = `${filePath}.${randomUUID()}.part`
    await fs.promises.writeFile(temporary, preview.bytes)
    await fs.promises.rename(temporary, filePath).catch(async (error) => {
      await fs.promises.rm(temporary, { force: true })
      if (!(await exists(filePath))) throw error
    })
  } catch {
    return null
  }
  return { filePath, mediaType: preview.mediaType }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

/** Drop the negative cache. Used by tests and after a library reset. */
export function forgetUnavailablePreviews(): void {
  unavailable.clear()
}
