/**
 * Image dimensions for version metadata (spec F3.5), read from the format
 * headers of the two MVP formats (PNG, JPEG) with small positioned reads —
 * the file is never loaded into memory.
 *
 * No image dependency: the agreed stack (docs/spec.md §2) doesn't include
 * one, and both headers are trivial to parse. Unparseable content yields
 * `null` — dimensions are nullable metadata, never a capture blocker.
 */
import fs from 'node:fs'
import type { FileHandle } from 'node:fs/promises'

export interface ImageDimensions {
  width: number
  height: number
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export async function readImageDimensions(filePath: string): Promise<ImageDimensions | null> {
  let file: FileHandle | undefined
  try {
    file = await fs.promises.open(filePath, 'r')
    const head = Buffer.alloc(24)
    const { bytesRead } = await file.read(head, 0, head.length, 0)

    // PNG: signature, then the IHDR chunk is required first —
    // width/height are big-endian u32 at fixed offsets 16/20.
    if (
      bytesRead >= 24 &&
      head.subarray(0, 8).equals(PNG_SIGNATURE) &&
      head.toString('latin1', 12, 16) === 'IHDR'
    ) {
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
    }

    // PSD: `8BPS`, version 1, then channels(2), height(4), width(4).
    if (
      bytesRead >= 22 &&
      head.toString('ascii', 0, 4) === '8BPS' &&
      head.readUInt16BE(4) === 1
    ) {
      return { width: head.readUInt32BE(18), height: head.readUInt32BE(14) }
    }

    // JPEG: SOI marker, then walk the segment list to a frame header.
    // `await` matters: without it the finally-close races the walk.
    if (bytesRead >= 2 && head[0] === 0xff && head[1] === 0xd8) {
      return await readJpegDimensions(file)
    }

    return null
  } catch {
    return null
  } finally {
    await file?.close()
  }
}

/**
 * Walks JPEG marker segments from offset 2 until a start-of-frame (SOFn)
 * segment, which stores precision(1) + height(2) + width(2) after its length.
 * Stops at start-of-scan / end-of-image — a well-formed file declares its
 * frame size before entropy-coded data.
 */
async function readJpegDimensions(file: FileHandle): Promise<ImageDimensions | null> {
  const buf = Buffer.alloc(7)
  let pos = 2
  // Guard against corrupt files looping forever; real headers are far shorter.
  for (let segments = 0; segments < 10_000; segments++) {
    let { bytesRead } = await file.read(buf, 0, 2, pos)
    if (bytesRead < 2 || buf[0] !== 0xff) return null
    const marker = buf[1]!
    if (marker === 0xff) {
      pos += 1 // fill byte before a marker
      continue
    }
    pos += 2
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue // standalone, no length
    if (marker === 0xd9 || marker === 0xda) return null // EOI / SOS without a frame header

    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrameHeader) {
      ;({ bytesRead } = await file.read(buf, 0, 7, pos))
      if (bytesRead < 7) return null
      return { width: buf.readUInt16BE(5), height: buf.readUInt16BE(3) }
    }

    ;({ bytesRead } = await file.read(buf, 0, 2, pos))
    if (bytesRead < 2) return null
    const segmentLength = buf.readUInt16BE(0)
    if (segmentLength < 2) return null
    pos += segmentLength
  }
  return null
}
