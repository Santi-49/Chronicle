/**
 * MVP-04 acceptance tests (TODO.md): three changed saves → exactly three
 * versions; identical bytes → no new version; duplicate content stored once;
 * 50 MB and missing-file handling. Plus library layout, dimension metadata,
 * AI-job enqueueing, and same-path concurrency.
 *
 * Every test runs against a real SQLite file and a real library directory
 * in a temp dir — nothing is mocked.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_FILE_NAME, openChronicleDb, type ChronicleDb } from '../db/database'
import { createAsset, getAsset, getAssetByPath, listJobs, listVersions } from '../db/repositories'
import { MAX_FILE_BYTES } from '../watcher/rules'
import { captureVersion, markFileMissing } from './capture'
import { libraryFilePathFor } from './library'
import { readImageDimensions } from './dimensions'

let dir: string
let libraryRoot: string
let workDir: string
let db: ChronicleDb

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-capture-'))
  libraryRoot = path.join(dir, 'library')
  workDir = path.join(dir, 'designs')
  fs.mkdirSync(workDir, { recursive: true })
  db = openChronicleDb(path.join(dir, DATABASE_FILE_NAME))
})

afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeFile(name: string, content: Buffer | string): string {
  const filePath = path.join(workDir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Minimal PNG header: signature + IHDR chunk carrying the dimensions. */
function pngBytes(width: number, height: number, extra = ''): Buffer {
  const head = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0)
  head.writeUInt32BE(13, 8) // IHDR length
  head.write('IHDR', 12, 'latin1')
  head.writeUInt32BE(width, 16)
  head.writeUInt32BE(height, 20)
  return Buffer.concat([head, Buffer.from(`\x08\x06\x00\x00\x00${extra}`, 'latin1')])
}

/** Minimal JPEG header: SOI, an APP0 segment, then SOF0 with the dimensions. */
function jpegBytes(width: number, height: number, extra = ''): Buffer {
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

/** Minimal PSD header: signature, version, reserved, channels, height, width. */
function psdBytes(width: number, height: number): Buffer {
  const header = Buffer.alloc(26)
  header.write('8BPS', 0, 'ascii')
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(3, 12)
  header.writeUInt32BE(height, 14)
  header.writeUInt32BE(width, 18)
  header.writeUInt16BE(8, 22)
  header.writeUInt16BE(3, 24)
  return header
}

describe('captureVersion', () => {
  it('three changed saves create exactly versions 1, 2, 3 (F3.4)', async () => {
    const file = writeFile('logo.png', pngBytes(800, 600, 'v1'))

    const first = await captureVersion(db, libraryRoot, file)
    fs.writeFileSync(file, pngBytes(800, 600, 'v2'))
    const second = await captureVersion(db, libraryRoot, file)
    fs.writeFileSync(file, pngBytes(800, 600, 'v3'))
    const third = await captureVersion(db, libraryRoot, file)

    for (const result of [first, second, third]) expect(result.outcome).toBe('captured')
    const asset = getAssetByPath(db, file)!
    const versions = listVersions(db, asset.id)
    expect(versions.map((v) => v.versionNumber)).toEqual([3, 2, 1]) // newest first
    expect(new Set(versions.map((v) => v.contentHash)).size).toBe(3)
    expect(asset.displayName).toBe('logo.png')
  })

  it('identical bytes create no new version and no new AI job (F3.3)', async () => {
    const content = pngBytes(64, 64)
    const file = writeFile('logo.png', content)

    const first = await captureVersion(db, libraryRoot, file)
    fs.writeFileSync(file, content) // re-save, same bytes
    const second = await captureVersion(db, libraryRoot, file)

    expect(first.outcome).toBe('captured')
    expect(second.outcome).toBe('unchanged')
    if (second.outcome !== 'unchanged') throw new Error('unreachable')
    expect(second.version.versionNumber).toBe(1)
    expect(listVersions(db, second.asset.id)).toHaveLength(1)
    expect(listJobs(db, 'ai_annotation')).toHaveLength(1)
  })

  it('duplicate content across different assets is stored once (F3.5 dedup)', async () => {
    const content = pngBytes(100, 50)
    const a = writeFile('banner-a.png', content)
    const b = writeFile('banner-b.png', content)

    const resultA = await captureVersion(db, libraryRoot, a)
    const resultB = await captureVersion(db, libraryRoot, b)
    expect(resultA.outcome).toBe('captured')
    expect(resultB.outcome).toBe('captured') // new asset, even though bytes are known
    if (resultA.outcome !== 'captured' || resultB.outcome !== 'captured') return

    expect(resultA.asset.id).not.toBe(resultB.asset.id)
    expect(resultA.version.contentHash).toBe(resultB.version.contentHash)
    const stored = libraryFilePathFor(libraryRoot, resultA.version.contentHash)
    expect(fs.existsSync(stored)).toBe(true)
    // One content file in the whole library — no duplicate copies.
    const files = fs
      .readdirSync(libraryRoot, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
    expect(files).toHaveLength(1)
  })

  it('stores bytes at library/<hash first 2>/<hash>, identical to the source', async () => {
    const content = jpegBytes(1920, 1080)
    const file = writeFile('shot.jpg', content)

    const result = await captureVersion(db, libraryRoot, file)
    expect(result.outcome).toBe('captured')
    if (result.outcome !== 'captured') return

    const hash = sha256(content)
    expect(result.version.contentHash).toBe(hash)
    const stored = path.join(libraryRoot, hash.slice(0, 2), hash)
    expect(fs.readFileSync(stored).equals(content)).toBe(true)
  })

  it('records size, timestamp, and PNG/JPEG dimensions (F3.5)', async () => {
    const png = writeFile('logo.png', pngBytes(800, 600))
    const jpg = writeFile('photo.jpg', jpegBytes(1920, 1080))

    const pngResult = await captureVersion(db, libraryRoot, png)
    const jpgResult = await captureVersion(db, libraryRoot, jpg)
    if (pngResult.outcome !== 'captured' || jpgResult.outcome !== 'captured') {
      throw new Error('expected captures')
    }

    expect(pngResult.version.width).toBe(800)
    expect(pngResult.version.height).toBe(600)
    expect(pngResult.version.sizeBytes).toBe(fs.statSync(png).size)
    expect(Date.parse(pngResult.version.capturedAt)).not.toBeNaN()
    expect(jpgResult.version.width).toBe(1920)
    expect(jpgResult.version.height).toBe(1080)
  })

  it('captures unparseable image content with null dimensions', async () => {
    const file = writeFile('weird.png', 'not really a png')
    const result = await captureVersion(db, libraryRoot, file)
    expect(result.outcome).toBe('captured')
    if (result.outcome !== 'captured') return
    expect(result.version.width).toBeNull()
    expect(result.version.height).toBeNull()
  })

  it('enqueues one ai_annotation job per captured version, never awaited', async () => {
    const file = writeFile('logo.png', pngBytes(10, 10, 'v1'))
    const first = await captureVersion(db, libraryRoot, file)
    fs.writeFileSync(file, pngBytes(10, 10, 'v2'))
    const second = await captureVersion(db, libraryRoot, file)
    if (first.outcome !== 'captured' || second.outcome !== 'captured') {
      throw new Error('expected captures')
    }

    const jobs = listJobs(db, 'ai_annotation')
    expect(jobs.map((j) => j.payload)).toEqual([
      { versionId: first.version.id },
      { versionId: second.version.id },
    ])
  })

  it('skips files over the 50 MB cap with no version and no library write (F3.6)', async () => {
    const file = writeFile('huge.png', 'seed')
    fs.truncateSync(file, MAX_FILE_BYTES + 1)

    const result = await captureVersion(db, libraryRoot, file)
    expect(result).toEqual({ outcome: 'skipped', reason: 'too-large' })
    expect(getAssetByPath(db, file)).toBeUndefined()
    expect(fs.existsSync(libraryRoot)).toBe(false)
  })

  it('reports a vanished file and flags a known asset as off-disk (F3.7)', async () => {
    // Never-captured path: skipped, nothing recorded.
    const ghost = path.join(workDir, 'ghost.png')
    expect(await captureVersion(db, libraryRoot, ghost)).toEqual({
      outcome: 'skipped',
      reason: 'file-missing',
    })
    expect(getAssetByPath(db, ghost)).toBeUndefined()

    // Captured, then deleted before the next capture ran: history kept, flagged.
    const file = writeFile('logo.png', pngBytes(5, 5))
    const captured = await captureVersion(db, libraryRoot, file)
    if (captured.outcome !== 'captured') throw new Error('expected capture')
    fs.rmSync(file)
    expect(await captureVersion(db, libraryRoot, file)).toEqual({
      outcome: 'skipped',
      reason: 'file-missing',
    })
    const asset = getAsset(db, captured.asset.id)!
    expect(asset.onDisk).toBe(false)
    expect(listVersions(db, asset.id)).toHaveLength(1)
  })

  it('an identical re-save of a file marked missing puts it back on disk', async () => {
    const content = pngBytes(5, 5)
    const file = writeFile('logo.png', content)
    const captured = await captureVersion(db, libraryRoot, file)
    if (captured.outcome !== 'captured') throw new Error('expected capture')

    markFileMissing(db, file)
    expect(getAsset(db, captured.asset.id)!.onDisk).toBe(false)

    fs.writeFileSync(file, content) // file re-appears with identical bytes
    const result = await captureVersion(db, libraryRoot, file)
    expect(result.outcome).toBe('unchanged')
    expect(getAsset(db, captured.asset.id)!.onDisk).toBe(true)
  })

  it('concurrent captures of the same path serialize into one version', async () => {
    const file = writeFile('logo.png', pngBytes(20, 20))
    const results = await Promise.all([
      captureVersion(db, libraryRoot, file),
      captureVersion(db, libraryRoot, file),
      captureVersion(db, libraryRoot, file),
    ])

    expect(results.filter((r) => r.outcome === 'captured')).toHaveLength(1)
    expect(results.filter((r) => r.outcome === 'unchanged')).toHaveLength(2)
    const asset = getAssetByPath(db, file)!
    expect(listVersions(db, asset.id)).toHaveLength(1)
    expect(listJobs(db, 'ai_annotation')).toHaveLength(1)
  })

  it('leaves no temp files behind in the library', async () => {
    const file = writeFile('logo.png', pngBytes(30, 30))
    await captureVersion(db, libraryRoot, file)
    fs.writeFileSync(file, pngBytes(30, 30)) // identical → snapshot discarded
    await captureVersion(db, libraryRoot, file)

    const leftovers = fs
      .readdirSync(libraryRoot)
      .filter((name) => name.startsWith('.snapshot-'))
    expect(leftovers).toEqual([])
  })
})

describe('markFileMissing', () => {
  it('is a no-op for unknown paths and idempotent for known ones', () => {
    markFileMissing(db, path.join(workDir, 'never-seen.png')) // must not throw
    const asset = createAsset(db, path.join(workDir, 'logo.png'))
    markFileMissing(db, asset.path)
    markFileMissing(db, asset.path)
    expect(getAsset(db, asset.id)!.onDisk).toBe(false)
  })
})

describe('readImageDimensions', () => {
  it('parses PNG, JPEG, and PSD headers and rejects other content', async () => {
    const png = writeFile('a.png', pngBytes(321, 123))
    const jpg = writeFile('a.jpg', jpegBytes(45, 67))
    const psd = writeFile('a.psd', psdBytes(640, 480))
    const txt = writeFile('a.txt', 'plain text, long enough to fill the header read')
    const empty = writeFile('empty.png', '')

    expect(await readImageDimensions(png)).toEqual({ width: 321, height: 123 })
    expect(await readImageDimensions(jpg)).toEqual({ width: 45, height: 67 })
    expect(await readImageDimensions(psd)).toEqual({ width: 640, height: 480 })
    expect(await readImageDimensions(txt)).toBeNull()
    expect(await readImageDimensions(empty)).toBeNull()
    expect(await readImageDimensions(path.join(workDir, 'missing.png'))).toBeNull()
  })

  it('walks past JPEG fill bytes and standalone markers to the frame header', async () => {
    const sof = Buffer.from([0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01]) // progressive
    const file = writeFile(
      'tricky.jpg',
      Buffer.concat([
        Buffer.from([0xff, 0xd8]), // SOI
        Buffer.from([0xff, 0xff]), // fill byte before next marker
        Buffer.from([0xff, 0x01]), // standalone TEM marker
        Buffer.from([0xff, 0xe1, 0x00, 0x06, 1, 2, 3, 4]), // APP1, length 6
        sof,
      ]),
    )
    expect(await readImageDimensions(file)).toEqual({ width: 3, height: 2 })
  })
})
