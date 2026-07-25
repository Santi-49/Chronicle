/**
 * Blender .blend: recover the preview image Blender embeds when saving.
 *
 * A .blend file cannot be rendered without Blender, and Chronicle never
 * executes a file's embedded Python (see docs/challenge/RESEARCH.md). Blender
 * does however write a screenshot/camera thumbnail into a `TEST` file-block for
 * the operating system's file browser, and that block can be read safely.
 *
 * Layout:
 *   header   'BLENDER'(7) pointerSize(1: '_'=4, '-'=8) endianness(1: 'v'|'V')
 *            version(3)
 *   blocks   code(4) length(4) address(pointerSize) sdnaIndex(4) count(4) body
 *            — so a body starts 16 + pointerSize bytes after its block header
 *   TEST     width(4) height(4) then width*height RGBA pixels, bottom row first
 *
 * The `TEST` body layout is not covered by public Blender documentation, so it
 * is validated against the block length and a plausible size before use: an
 * unrecognised layout yields no preview rather than a corrupt image. Files
 * saved with compression (gzip, or Zstandard since Blender 3.0) are read
 * through a bounded decompression of just the leading bytes.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { encodeRgbaPng } from './png-encode'
import type { DerivedPreview } from './io'

const MAGIC = 'BLENDER'
/** The header and its thumbnail block sit at the start of the file. */
const SCAN_BYTES = 12 * 1024 * 1024
const MAX_BLOCKS = 64
const MAX_THUMBNAIL_EDGE = 2_048

export interface BlendHeader {
  version: string
  pointerSize: 4 | 8
  littleEndian: boolean
  compressed: boolean
}

/** Read the leading bytes, transparently decompressing gzip/Zstandard files. */
async function readLeadingBytes(filePath: string): Promise<{ bytes: Buffer; compressed: boolean }> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const raw = Buffer.alloc(SCAN_BYTES)
    const { bytesRead } = await handle.read(raw, 0, SCAN_BYTES, 0)
    const head = raw.subarray(0, bytesRead)
    if (head.toString('ascii', 0, MAGIC.length) === MAGIC) {
      return { bytes: head, compressed: false }
    }
    return { bytes: await inflateLeadingBytes(head), compressed: true }
  } finally {
    await handle.close()
  }
}

/**
 * Decompress at most SCAN_BYTES of output. A truncated tail is expected — we
 * only need the header and the thumbnail block — so a "corrupt stream" error
 * after useful output has been produced is not treated as a failure.
 */
async function inflateLeadingBytes(head: Buffer): Promise<Buffer> {
  const gzip = head[0] === 0x1f && head[1] === 0x8b
  const zstandard = head.readUInt32LE(0) === 0xfd2fb528
  if (!gzip && !zstandard) return Buffer.alloc(0)

  const chunks: Buffer[] = []
  let size = 0
  const stream = gzip
    ? zlib.createGunzip()
    : // Node ships Zstandard support from v23.8; older runtimes simply fail here
      // and the file falls back to having no preview.
      (zlib as unknown as { createZstdDecompress?: () => zlib.Gunzip }).createZstdDecompress?.()
  if (!stream) return Buffer.alloc(0)

  await new Promise<void>((resolve) => {
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      size += chunk.length
      if (size >= SCAN_BYTES) stream.destroy()
    })
    stream.on('end', resolve)
    stream.on('close', resolve)
    stream.on('error', resolve)
    stream.end(head)
  })
  return Buffer.concat(chunks).subarray(0, SCAN_BYTES)
}

function parseHeader(bytes: Buffer): BlendHeader | null {
  if (bytes.length < 12 || bytes.toString('ascii', 0, MAGIC.length) !== MAGIC) return null
  const pointerFlag = String.fromCharCode(bytes[7]!)
  const endianFlag = String.fromCharCode(bytes[8]!)
  if ((pointerFlag !== '_' && pointerFlag !== '-') || (endianFlag !== 'v' && endianFlag !== 'V')) {
    return null
  }
  return {
    version: bytes.toString('ascii', 9, 12),
    pointerSize: pointerFlag === '-' ? 8 : 4,
    littleEndian: endianFlag === 'v',
    compressed: false,
  }
}

/** Header facts worth showing in the UI when no thumbnail exists. */
export async function readBlendHeader(filePath: string): Promise<BlendHeader | null> {
  try {
    const { bytes, compressed } = await readLeadingBytes(filePath)
    const header = parseHeader(bytes)
    return header && { ...header, compressed }
  } catch {
    return null
  }
}

/** The embedded thumbnail as a PNG, or null when the file carries none. */
export async function readBlendPreview(filePath: string): Promise<DerivedPreview | null> {
  try {
    const { bytes } = await readLeadingBytes(filePath)
    const header = parseHeader(bytes)
    if (!header) return null

    const readU32 = (offset: number): number =>
      header.littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)

    let cursor = 12
    for (let block = 0; block < MAX_BLOCKS; block++) {
      // Block header: code(4) size(4) address(pointerSize) sdnaIndex(4) count(4).
      const bodyStart = cursor + 16 + header.pointerSize
      if (bodyStart > bytes.length) return null
      const code = bytes.toString('ascii', cursor, cursor + 4)
      const bodyLength = readU32(cursor + 4)
      if (code === 'ENDB' || bodyLength < 0) return null
      if (code === 'TEST') {
        return decodeThumbnail(bytes.subarray(bodyStart, bodyStart + bodyLength), readU32, bodyStart)
      }
      cursor = bodyStart + bodyLength
    }
    return null
  } catch {
    return null
  }
}

function decodeThumbnail(
  body: Buffer,
  readU32: (offset: number) => number,
  bodyStart: number,
): DerivedPreview | null {
  if (body.length < 8) return null
  const width = readU32(bodyStart)
  const height = readU32(bodyStart + 4)
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_THUMBNAIL_EDGE ||
    height > MAX_THUMBNAIL_EDGE ||
    body.length < 8 + width * height * 4
  ) {
    return null
  }

  // Blender stores the image bottom row first, like OpenGL.
  const stride = width * 4
  const flipped = Buffer.alloc(width * height * 4)
  for (let row = 0; row < height; row++) {
    body.copy(flipped, row * stride, 8 + (height - 1 - row) * stride, 8 + (height - row) * stride)
  }
  try {
    return { bytes: encodeRgbaPng(width, height, flipped), mediaType: 'image/png' }
  } catch {
    return null
  }
}
