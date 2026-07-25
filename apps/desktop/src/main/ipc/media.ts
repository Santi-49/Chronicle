/**
 * chronicle:// media URLs (C1 rule: images reach the renderer as URLs served
 * by main from the library — never as raw bytes over IPC, never as filesystem
 * paths the renderer could roam).
 *
 * URL shapes:
 *   chronicle://image/<format>/<sha256 hex>    the stored original bytes
 *   chronicle://preview/<format>/<sha256 hex>  a derived, displayable image
 *
 * Only the format id and the hash vary, and both are strictly validated, so the
 * protocol handler can only ever serve files inside the content-addressed
 * library (or the derived-preview cache beside it).
 *
 * The format travels in the URL because library files are stored under their
 * content hash with no extension: the bytes alone do not always identify the
 * format, and magic-byte sniffing cannot distinguish PSD from PSB or tell an
 * OBJ from any other text file.
 */
import { formatById, isFormatId, type FormatDescriptor, type FormatId } from '../../shared/formats'

export const CHRONICLE_SCHEME = 'chronicle'

const SHA256_HEX = /^[0-9a-f]{64}$/

export type MediaKind = 'image' | 'preview'

export interface MediaRequest {
  kind: MediaKind
  format: FormatDescriptor
  contentHash: string
}

/** Renderer-safe URL for one version's stored bytes. */
export function imageUrlForHash(contentHash: string, format: FormatId): string {
  return `${CHRONICLE_SCHEME}://image/${format}/${contentHash}`
}

/** Renderer-safe URL for one version's derived preview image. */
export function previewUrlForHash(contentHash: string, format: FormatId): string {
  return `${CHRONICLE_SCHEME}://preview/${format}/${contentHash}`
}

/**
 * The URL a list or timeline should use as a version's thumbnail: the derived
 * preview for formats Chromium cannot decode, the original otherwise. Formats
 * with no still image at all return null so the UI shows a placeholder.
 */
export function thumbnailUrlForHash(contentHash: string, format: FormatId): string | null {
  const descriptor = formatById(format)
  if (descriptor.preview === 'none') return null
  return descriptor.preview === 'derived'
    ? previewUrlForHash(contentHash, format)
    : imageUrlForHash(contentHash, format)
}

/**
 * Parse and validate a chronicle:// request URL. Anything else — wrong
 * scheme/host, unknown format, traversal attempts, non-hash paths — returns
 * null and is served as 404.
 */
export function parseChronicleUrl(url: string): MediaRequest | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${CHRONICLE_SCHEME}:`) return null
  const kind = parsed.hostname
  if (kind !== 'image' && kind !== 'preview') return null

  const segments = parsed.pathname.replace(/^\//, '').split('/')
  if (segments.length !== 2) return null
  const [format, hash] = segments as [string, string]
  if (!isFormatId(format) || !SHA256_HEX.test(hash.toLowerCase())) return null
  return { kind, format: formatById(format), contentHash: hash.toLowerCase() }
}
