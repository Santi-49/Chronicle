/**
 * chronicle:// image URLs (C1 rule: images reach the renderer as URLs served
 * by main from the library — never as raw bytes over IPC, never as
 * filesystem paths the renderer could roam).
 *
 * URL shape: chronicle://image/<sha256 hex>. The hash is the only variable
 * part and is strictly validated, so the protocol handler can only ever
 * serve files that exist inside the content-addressed library.
 */

export const CHRONICLE_SCHEME = 'chronicle'

const SHA256_HEX = /^[0-9a-f]{64}$/

/** Renderer-safe URL for one version's stored bytes (thumbnail and full view alike). */
export function imageUrlForHash(contentHash: string): string {
  return `${CHRONICLE_SCHEME}://image/${contentHash}`
}

/**
 * Parses and validates a chronicle:// request URL back to a content hash.
 * Anything else — wrong scheme/host, traversal attempts, non-hash paths —
 * returns null and is served as 404.
 */
export function chronicleUrlToHash(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${CHRONICLE_SCHEME}:` || parsed.hostname !== 'image') return null
  const hash = parsed.pathname.replace(/^\//, '').toLowerCase()
  return SHA256_HEX.test(hash) ? hash : null
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Content type from the stored bytes' magic numbers — library files carry no
 * extension, and the two MVP formats are unambiguous from the first bytes.
 */
export function sniffImageContentType(head: Buffer): string {
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png'
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg'
  return 'application/octet-stream'
}
