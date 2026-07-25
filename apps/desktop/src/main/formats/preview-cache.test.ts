/**
 * Derived-preview cache tests: previews are generated once per content hash,
 * shared by every asset with the same bytes, and a format that yields no
 * preview stays cheap on repeated requests.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forgetUnavailablePreviews, resolvePreview } from './preview-cache'
import { objCube, photoshopBytes, tinyJpeg } from './fixtures'

let dir: string
let libraryRoot: string
let previewRoot: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-preview-'))
  libraryRoot = path.join(dir, 'library')
  previewRoot = path.join(dir, 'previews')
  forgetUnavailablePreviews()
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Store bytes in the library exactly as capture does, and return the hash. */
function store(content: Buffer | string): string {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const target = path.join(libraryRoot, hash.slice(0, 2), hash)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  return hash
}

const options = (): { libraryRoot: string; previewRoot: string } => ({ libraryRoot, previewRoot })

describe('resolvePreview', () => {
  it('generates, caches, and reuses a preview for stored bytes', async () => {
    const hash = store(photoshopBytes(32, 16, { thumbnail: tinyJpeg() }))

    const first = await resolvePreview(options(), hash, 'psd')
    expect(first?.mediaType).toBe('image/jpeg')
    expect(fs.existsSync(first!.filePath)).toBe(true)

    // Remove the source: a cached preview must still resolve.
    fs.rmSync(path.join(libraryRoot, hash.slice(0, 2), hash))
    const second = await resolvePreview(options(), hash, 'psd')
    expect(second).toEqual(first)
  })

  it('does the work once when the same preview is requested concurrently', async () => {
    const hash = store(objCube())
    const [a, b, c] = await Promise.all([
      resolvePreview(options(), hash, 'obj'),
      resolvePreview(options(), hash, 'obj'),
      resolvePreview(options(), hash, 'obj'),
    ])
    expect(a?.mediaType).toBe('image/svg+xml')
    expect(b).toEqual(a)
    expect(c).toEqual(a)

    const cached = fs.readdirSync(path.join(previewRoot, hash.slice(0, 2)))
    expect(cached).toHaveLength(1)
  })

  it('keys the cache by format as well as hash', async () => {
    // Identical bytes are a valid PSD and PSB header aside from the version.
    const psd = store(photoshopBytes(8, 8, { thumbnail: tinyJpeg() }))
    const preview = await resolvePreview(options(), psd, 'psd')
    const asPsb = await resolvePreview(options(), psd, 'psb')
    expect(preview?.filePath).not.toBe(asPsb?.filePath)
  })

  it('returns null — without throwing — when no preview can be produced', async () => {
    expect(await resolvePreview(options(), store(photoshopBytes(8, 8)), 'psd')).toBeNull()
    expect(await resolvePreview(options(), store('no geometry here'), 'obj')).toBeNull()
    // Missing library bytes and formats with no generator at all.
    expect(await resolvePreview(options(), 'ab'.repeat(32), 'psd')).toBeNull()
    expect(await resolvePreview(options(), store('anything'), 'step')).toBeNull()
    expect(fs.existsSync(previewRoot)).toBe(false)
  })

  it('remembers that a hash has no preview so repeats stay cheap', async () => {
    const hash = store(photoshopBytes(8, 8))
    expect(await resolvePreview(options(), hash, 'psd')).toBeNull()

    // Replacing the bytes cannot happen in a content-addressed library, so the
    // negative answer is allowed to stick until the cache is cleared.
    fs.writeFileSync(
      path.join(libraryRoot, hash.slice(0, 2), hash),
      photoshopBytes(8, 8, { thumbnail: tinyJpeg() }),
    )
    expect(await resolvePreview(options(), hash, 'psd')).toBeNull()

    forgetUnavailablePreviews()
    expect(await resolvePreview(options(), hash, 'psd')).not.toBeNull()
  })
})
