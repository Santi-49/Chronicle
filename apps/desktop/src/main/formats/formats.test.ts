/**
 * Format-registry and per-format handler tests.
 *
 * Covers the contract the rest of the app relies on: every declared format
 * resolves from a path, metadata readers parse the headers they claim to, and
 * preview generators either return a displayable image or `null` — never throw,
 * because they run on arbitrary stored bytes.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FORMATS,
  extensionOf,
  formatById,
  formatForPath,
  isFormatId,
  supportsAnnotation,
  SUPPORTED_EXTENSIONS,
  type FormatId,
} from '../../shared/formats'
import { createFormatPreview, readFormatDimensions } from './index'
import { encodeRgbaPng } from './png-encode'
import { meshToSvg } from './mesh'
import { parseObj } from './obj'
import { readBlendHeader } from './blend'
import {
  blendBytes,
  jpegBytes,
  objCube,
  photoshopBytes,
  pngBytes,
  tinyJpeg,
} from './fixtures'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-formats-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function write(name: string, content: Buffer | string): string {
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('format registry', () => {
  it('declares consistent, unique entries', () => {
    const ids = FORMATS.map((format) => format.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(SUPPORTED_EXTENSIONS).size).toBe(SUPPORTED_EXTENSIONS.length)
    for (const format of FORMATS) {
      expect(format.extensions.length).toBeGreaterThan(0)
      for (const extension of format.extensions) {
        expect(extension, format.id).toMatch(/^\.[a-z0-9]+$/)
      }
      expect(formatById(format.id)).toBe(format)
      // A format the renderer cannot decode itself must not claim 'native'.
      if (format.preview === 'native') {
        expect(['image/png', 'image/jpeg', 'image/svg+xml']).toContain(format.mediaType)
      }
    }
  })

  it('resolves a format from any path shape, case-insensitively', () => {
    expect(formatForPath('C:\\Designs\\logo.PNG')?.id).toBe('png')
    expect(formatForPath('/home/x/banner.jpeg')?.id).toBe('jpg')
    expect(formatForPath('C:/models/part.STP')?.id).toBe('step')
    expect(formatForPath('scene.blend')?.id).toBe('blend')
    expect(formatForPath('C:\\Designs\\notes.txt')).toBeNull()
    // A dotfile has no extension: '.png' is the whole name, not a type.
    expect(formatForPath('C:\\Designs\\.png')).toBeNull()
    expect(formatForPath('C:\\Designs\\logo')).toBeNull()
  })

  it('extracts extensions without a path dependency', () => {
    expect(extensionOf('a/b/c.PsD')).toBe('.psd')
    expect(extensionOf('a.tar.gz')).toBe('.gz')
    expect(extensionOf('plain')).toBe('')
  })

  it('guards format ids arriving from URLs and IPC', () => {
    expect(isFormatId('psd')).toBe(true)
    expect(isFormatId('gif')).toBe(false)
    expect(isFormatId(undefined)).toBe(false)
    expect(() => formatById('gif' as FormatId)).toThrow(/Unknown format/)
  })

  it('marks the MVP image formats as annotatable and the new ones as pending', () => {
    expect(supportsAnnotation(formatById('png'))).toBe(true)
    expect(supportsAnnotation(formatById('jpg'))).toBe(true)
    expect(supportsAnnotation(formatById('psd'))).toBe(true)
    for (const id of ['svg', 'psb', 'obj', 'step', 'blend'] as FormatId[]) {
      expect(supportsAnnotation(formatById(id)), id).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('readFormatDimensions', () => {
  it('parses the headers of every format that declares dimensions', async () => {
    expect(await readFormatDimensions(write('a.png', pngBytes(321, 123)), 'png')).toEqual({
      width: 321,
      height: 123,
    })
    expect(await readFormatDimensions(write('a.jpg', jpegBytes(45, 67)), 'jpg')).toEqual({
      width: 45,
      height: 67,
    })
    expect(await readFormatDimensions(write('a.psd', photoshopBytes(640, 480)), 'psd')).toEqual({
      width: 640,
      height: 480,
    })
    // PSB is the same header with version 2.
    expect(
      await readFormatDimensions(write('a.psb', photoshopBytes(70_000, 5, { version: 2 })), 'psb'),
    ).toEqual({ width: 70_000, height: 5 })
  })

  it('reads SVG size from width/height, falling back to the viewBox', async () => {
    const withSize = write('a.svg', '<?xml version="1.0"?>\n<svg width="120" height="60"></svg>')
    expect(await readFormatDimensions(withSize, 'svg')).toEqual({ width: 120, height: 60 })

    const withUnits = write('b.svg', '<svg width="1in" height="0.5in"></svg>')
    expect(await readFormatDimensions(withUnits, 'svg')).toEqual({ width: 96, height: 48 })

    // Relative units are not absolute sizes — the viewBox decides.
    const relative = write('c.svg', "<svg width='100%' height='100%' viewBox='0 0 32 16'></svg>")
    expect(await readFormatDimensions(relative, 'svg')).toEqual({ width: 32, height: 16 })

    const none = write('d.svg', '<svg></svg>')
    expect(await readFormatDimensions(none, 'svg')).toBeNull()
  })

  it('walks past JPEG fill bytes and standalone markers to the frame header', async () => {
    const sof = Buffer.from([0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01])
    const file = write(
      'tricky.jpg',
      Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xff]), // fill byte before next marker
        Buffer.from([0xff, 0x01]), // standalone TEM marker
        Buffer.from([0xff, 0xe1, 0x00, 0x06, 1, 2, 3, 4]), // APP1, length 6
        sof,
      ]),
    )
    expect(await readFormatDimensions(file, 'jpg')).toEqual({ width: 3, height: 2 })
  })

  it('returns null for unreadable, empty, and mismatched content', async () => {
    expect(await readFormatDimensions(write('a.txt', 'plain text, long enough'), 'png')).toBeNull()
    expect(await readFormatDimensions(write('empty.png', ''), 'png')).toBeNull()
    expect(await readFormatDimensions(path.join(dir, 'missing.png'), 'png')).toBeNull()
    // Formats with no dimension concept simply have no reader.
    expect(await readFormatDimensions(write('a.obj', objCube()), 'obj')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

describe('createFormatPreview', () => {
  it('is a no-op for natively displayable formats', async () => {
    expect(await createFormatPreview(write('a.png', pngBytes(4, 4)), 'png')).toBeNull()
    expect(await createFormatPreview(write('a.svg', '<svg></svg>'), 'svg')).toBeNull()
  })

  it('extracts the embedded JPEG thumbnail from PSD and PSB', async () => {
    const thumbnail = tinyJpeg()
    for (const [name, format, version] of [
      ['a.psd', 'psd', 1],
      ['a.psb', 'psb', 2],
    ] as const) {
      const file = write(name, photoshopBytes(64, 32, { thumbnail, version }))
      const preview = await createFormatPreview(file, format)
      expect(preview?.mediaType, name).toBe('image/jpeg')
      expect(preview?.bytes.equals(thumbnail), name).toBe(true)
    }
  })

  it('has no PSD preview when the document carries no thumbnail resource', async () => {
    const file = write('bare.psd', photoshopBytes(64, 32))
    expect(await createFormatPreview(file, 'psd')).toBeNull()
  })

  it('skips the Photoshop 4.0 thumbnail rather than showing swapped colours', async () => {
    const file = write('legacy.psd', photoshopBytes(64, 32, {
      thumbnail: tinyJpeg(),
      legacyThumbnail: true,
    }))
    expect(await createFormatPreview(file, 'psd')).toBeNull()
  })

  it('renders an OBJ mesh as an SVG thumbnail', async () => {
    const preview = await createFormatPreview(write('cube.obj', objCube()), 'obj')
    expect(preview?.mediaType).toBe('image/svg+xml')
    const svg = preview!.bytes.toString('utf8')
    expect(svg.startsWith('<svg')).toBe(true)
    // Six quads fanned into two triangles each.
    expect(svg.match(/<polygon/g)).toHaveLength(12)
  })

  it('extracts a .blend thumbnail, including from a compressed file', async () => {
    const rgba = Buffer.alloc(2 * 2 * 4, 0x40)
    for (const gzip of [false, true]) {
      const file = write(`scene-${gzip}.blend`, blendBytes({ thumbnail: { width: 2, height: 2, rgba }, gzip }))
      const preview = await createFormatPreview(file, 'blend')
      expect(preview?.mediaType, String(gzip)).toBe('image/png')
      // Decodes as a real PNG of the declared size.
      expect(preview!.bytes.subarray(1, 4).toString('ascii'), String(gzip)).toBe('PNG')
      expect(preview!.bytes.readUInt32BE(16)).toBe(2)
      expect(preview!.bytes.readUInt32BE(20)).toBe(2)
    }
  })

  it('reads .blend header facts and gives no preview when there is no thumbnail', async () => {
    const file = write('plain.blend', blendBytes({ pointerSize: 8 }))
    expect(await readBlendHeader(file)).toEqual({
      version: '403',
      pointerSize: 8,
      littleEndian: true,
      compressed: false,
    })
    expect(await createFormatPreview(file, 'blend')).toBeNull()
  })

  it('never throws on corrupt or hostile bytes', async () => {
    const junk = Buffer.from('not really a creative file at all', 'utf8')
    for (const format of FORMATS) {
      const file = write(`junk${format.extensions[0]}`, junk)
      await expect(createFormatPreview(file, format.id)).resolves.not.toThrow()
      await expect(readFormatDimensions(file, format.id)).resolves.not.toThrow()
    }

    // A .blend claiming a 4 GB thumbnail must be rejected, not allocated.
    const lying = blendBytes({ thumbnail: { width: 2, height: 2, rgba: Buffer.alloc(16) } })
    lying.writeUInt32LE(40_000, 12 + 8 + 12 + 8) // overwrite the TEST width
    expect(await createFormatPreview(write('lying.blend', lying), 'blend')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

describe('OBJ parsing', () => {
  it('triangulates polygons and resolves relative indices', async () => {
    const mesh = await parseObj(write('cube.obj', objCube()))
    expect(mesh.vertices).toHaveLength(8 * 3)
    expect(mesh.triangles).toHaveLength(12 * 3)
    expect(mesh.truncated).toBe(false)

    const relative = await parseObj(
      write('rel.obj', 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n'),
    )
    expect([...relative.triangles]).toEqual([0, 1, 2])
  })

  it('ignores faces that reference vertices outside the file', async () => {
    const mesh = await parseObj(write('bad.obj', 'v 0 0 0\nv 1 0 0\nf 1 2 99\n'))
    expect(mesh.triangles).toHaveLength(0)
    expect(mesh.vertices).toHaveLength(6)
  })

  it('returns an empty mesh for a missing or non-OBJ file', async () => {
    expect((await parseObj(path.join(dir, 'missing.obj'))).vertices).toHaveLength(0)
    const text = await parseObj(write('notes.obj', 'this file has no geometry\n'))
    expect(text.vertices).toHaveLength(0)
  })
})

describe('meshToSvg', () => {
  it('returns null for an empty mesh so callers can fall back', () => {
    expect(
      meshToSvg({ vertices: new Float64Array(0), triangles: new Uint32Array(0), truncated: false }),
    ).toBeNull()
  })

  it('draws points when a mesh has vertices but no faces', () => {
    const svg = meshToSvg({
      vertices: Float64Array.from([0, 0, 0, 1, 1, 1, -1, 0.5, 0]),
      triangles: new Uint32Array(0),
      truncated: false,
    })
    expect(svg).toContain('<circle')
    expect(svg).not.toContain('<polygon')
  })

  it('keeps every coordinate inside the viewport', () => {
    const svg = meshToSvg({
      vertices: Float64Array.from([-500, -500, -500, 900, 20, 3, 4, 800, 6]),
      triangles: Uint32Array.from([0, 1, 2]),
      truncated: false,
    })!
    const numbers = [...svg.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].flatMap((match) => [
      Number(match[1]),
      Number(match[2]),
    ])
    expect(numbers.length).toBeGreaterThan(0)
    for (const value of numbers) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(512)
    }
  })
})

describe('encodeRgbaPng', () => {
  it('produces a PNG that inflates back to the original pixels', () => {
    const rgba = Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 128,
    ])
    const png = encodeRgbaPng(2, 2, rgba)
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(2)

    // IHDR is 25 bytes after the signature; IDAT data follows its own header.
    const idatStart = 8 + 25 + 8
    const idatLength = png.readUInt32BE(8 + 25)
    const raw = zlib.inflateSync(png.subarray(idatStart, idatStart + idatLength))
    // Two scanlines, each prefixed with filter byte 0.
    expect(raw[0]).toBe(0)
    expect(raw.subarray(1, 9)).toEqual(rgba.subarray(0, 8))
    expect(raw[9]).toBe(0)
    expect(raw.subarray(10, 18)).toEqual(rgba.subarray(8, 16))
  })

  it('refuses a buffer that does not match the declared size', () => {
    expect(() => encodeRgbaPng(2, 2, Buffer.alloc(4))).toThrow(/RGBA bytes/)
    expect(() => encodeRgbaPng(0, 1, Buffer.alloc(0))).toThrow(/positive/)
  })
})
