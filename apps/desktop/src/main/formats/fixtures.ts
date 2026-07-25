/**
 * Byte-level fixtures for format tests.
 *
 * Real creative files are large and licence-encumbered, so the format handlers
 * are tested against the smallest structurally valid documents that carry the
 * fields they read. Shared between the format, capture, and IPC suites.
 */
import zlib from 'node:zlib'

/** Minimal PNG header: signature + IHDR chunk carrying the dimensions. */
export function pngBytes(width: number, height: number, extra = ''): Buffer {
  const head = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0)
  head.writeUInt32BE(13, 8) // IHDR length
  head.write('IHDR', 12, 'latin1')
  head.writeUInt32BE(width, 16)
  head.writeUInt32BE(height, 20)
  return Buffer.concat([head, Buffer.from(`\x08\x06\x00\x00\x00${extra}`, 'latin1')])
}

/** Minimal JPEG: SOI, an APP0 segment, then SOF0 with the dimensions. */
export function jpegBytes(width: number, height: number, extra = ''): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03])
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), // APP0, length 4
    sof,
    Buffer.from(`tail-${extra}`, 'latin1'),
  ])
}

export interface PhotoshopOptions {
  /** 1 = PSD, 2 = PSB. */
  version?: 1 | 2
  /** JPEG bytes to embed as image resource 1036, if any. */
  thumbnail?: Buffer
  /** Use the Photoshop 4.0 BGR resource id (1033) instead of 1036. */
  legacyThumbnail?: boolean
}

/**
 * PSD/PSB document: 26-byte header, an empty colour-mode section, and an image
 * resources section that optionally carries an embedded JPEG thumbnail.
 */
export function photoshopBytes(
  width: number,
  height: number,
  options: PhotoshopOptions = {},
): Buffer {
  const header = Buffer.alloc(26)
  header.write('8BPS', 0, 'ascii')
  header.writeUInt16BE(options.version ?? 1, 4)
  header.writeUInt16BE(3, 12) // channels
  header.writeUInt32BE(height, 14)
  header.writeUInt32BE(width, 18)
  header.writeUInt16BE(8, 22) // depth
  header.writeUInt16BE(3, 24) // colour mode: RGB

  const colourMode = Buffer.alloc(4) // length 0

  const resources: Buffer[] = []
  if (options.thumbnail) {
    const info = Buffer.alloc(28)
    info.writeUInt32BE(1, 0) // format: kJpegRGB
    info.writeUInt32BE(width, 4)
    info.writeUInt32BE(height, 8)
    info.writeUInt32BE(width * 4, 12) // padded row bytes
    info.writeUInt32BE(width * 4 * height, 16)
    info.writeUInt32BE(options.thumbnail.length, 20) // compressed size
    info.writeUInt16BE(24, 24) // bits per pixel
    info.writeUInt16BE(1, 26) // planes
    resources.push(resourceBlock(options.legacyThumbnail ? 1033 : 1036, Buffer.concat([info, options.thumbnail])))
  }
  // A second resource proves the walker keeps going past unrelated blocks.
  resources.push(resourceBlock(1005, Buffer.alloc(16)))

  const body = Buffer.concat(resources)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  return Buffer.concat([header, colourMode, length, body])
}

/** One '8BIM' resource block: signature, id, empty pascal name, size, data. */
function resourceBlock(id: number, data: Buffer): Buffer {
  const prefix = Buffer.alloc(12)
  prefix.write('8BIM', 0, 'ascii')
  prefix.writeUInt16BE(id, 4)
  prefix.writeUInt16BE(0, 6) // empty name: one length byte + one pad byte
  prefix.writeUInt32BE(data.length, 8)
  const padding = data.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0)
  return Buffer.concat([prefix, data, padding])
}

/** A tiny but decodable JPEG, for embedding as a Photoshop thumbnail. */
export function tinyJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]),
    Buffer.from([0xff, 0xd9]),
  ])
}

export interface BlendOptions {
  /** Thumbnail dimensions and pixels to store in the TEST block. */
  thumbnail?: { width: number; height: number; rgba: Buffer }
  /** Wrap the whole file in gzip, as Blender's compressed save does. */
  gzip?: boolean
  /** 8 for 64-bit pointers ('-'), 4 for 32-bit ('_'). */
  pointerSize?: 4 | 8
}

/** A .blend file: 12-byte header, an optional TEST thumbnail block, then ENDB. */
export function blendBytes(options: BlendOptions = {}): Buffer {
  const pointerSize = options.pointerSize ?? 8
  const header = Buffer.alloc(12)
  header.write('BLENDER', 0, 'ascii')
  header.write(pointerSize === 8 ? '-' : '_', 7, 'ascii')
  header.write('v', 8, 'ascii') // little-endian
  header.write('403', 9, 'ascii')

  const blocks: Buffer[] = []
  // A leading unrelated block proves the walker scans forward.
  blocks.push(blendBlock('REND', pointerSize, Buffer.alloc(8)))
  if (options.thumbnail) {
    const { width, height, rgba } = options.thumbnail
    const body = Buffer.alloc(8 + rgba.length)
    body.writeUInt32LE(width, 0)
    body.writeUInt32LE(height, 4)
    rgba.copy(body, 8)
    blocks.push(blendBlock('TEST', pointerSize, body))
  }
  blocks.push(blendBlock('ENDB', pointerSize, Buffer.alloc(0)))

  const file = Buffer.concat([header, ...blocks])
  return options.gzip ? zlib.gzipSync(file) : file
}

/** code(4) size(4) address(pointerSize) sdnaIndex(4) count(4), then the body. */
function blendBlock(code: string, pointerSize: number, body: Buffer): Buffer {
  const head = Buffer.alloc(16 + pointerSize)
  head.write(code.padEnd(4, '\0'), 0, 'ascii')
  head.writeUInt32LE(body.length, 4)
  // The original memory address, SDNA index, and struct count all stay zero.
  head.writeUInt32LE(1, 12 + pointerSize) // count
  return Buffer.concat([head, body])
}

/** A unit cube as Wavefront OBJ text, with quad faces to test fanning. */
export function objCube(): string {
  return [
    '# unit cube',
    'mtllib ignored.mtl',
    'v -1 -1 -1',
    'v  1 -1 -1',
    'v  1  1 -1',
    'v -1  1 -1',
    'v -1 -1  1',
    'v  1 -1  1',
    'v  1  1  1',
    'v -1  1  1',
    'vn 0 0 1',
    'f 1/1/1 2/2/1 3/3/1 4/4/1',
    'f 5 6 7 8',
    'f 1 5 8 4',
    'f 2 6 7 3',
    'f 1 2 6 5',
    'f 4 3 7 8',
    '',
  ].join('\n')
}
