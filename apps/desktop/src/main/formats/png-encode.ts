/**
 * Minimal PNG encoder for raw RGBA pixels.
 *
 * Used by preview generators that recover an uncompressed bitmap from a
 * container (currently the thumbnail embedded in a .blend file). Node's zlib
 * does the only hard part, so this stays a few dozen lines instead of adding
 * an image dependency the agreed stack (docs/spec.md §2) does not include.
 */
import zlib from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/**
 * Encode `width * height` RGBA bytes (top row first) as a PNG.
 * Throws when the buffer is not exactly the declared size, so a
 * misinterpreted container can never produce a corrupt image.
 */
export function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  if (width <= 0 || height <= 0) throw new Error('PNG dimensions must be positive')
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, received ${rgba.length}`)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: truecolour with alpha
  // 10..12 stay zero: deflate compression, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type (0 = none).
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0
    rgba.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride)
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
