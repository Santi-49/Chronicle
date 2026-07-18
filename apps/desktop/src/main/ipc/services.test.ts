/**
 * MVP-05 acceptance tests (TODO.md): every implemented handler matches C1,
 * renderer inputs are validated, images are returned as chronicle:// URLs
 * (never paths or bytes), secrets never appear in renderer-visible data,
 * and the watcher → capture wiring emits the C1 events.
 *
 * Runs against a real SQLite file, a real library, and real watched folders
 * in a temp dir. Electron pieces (dialog, safeStorage, connectivity) are the
 * injected deps that register.ts supplies in production.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChronicleEventName, ChronicleEvents } from '../../shared/ipc'
import { DATABASE_FILE_NAME, openChronicleDb, type ChronicleDb } from '../db/database'
import {
  appendVersion,
  deleteJob,
  getAssetByPath,
  listJobs,
  saveAnnotation,
  setVersionAiStatus,
} from '../db/repositories'
import { MAX_FILE_BYTES } from '../watcher/rules'
import { captureVersion } from '../versioning'
import { API_METHOD_NAMES } from './channels'
import { chronicleUrlToHash, imageUrlForHash, sniffImageContentType } from './media'
import {
  createChronicleServices,
  DEFAULT_SETTINGS,
  type ChronicleServices,
} from './services'

interface RecordedEvent {
  event: ChronicleEventName
  payload: unknown
}

let dir: string
let libraryRoot: string
let workDir: string
let db: ChronicleDb
let services: ChronicleServices
let events: RecordedEvent[]
let nextPick: string | null
let online: boolean
let secretValue: string | null

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-ipc-'))
  libraryRoot = path.join(dir, 'library')
  workDir = path.join(dir, 'designs')
  fs.mkdirSync(workDir, { recursive: true })
  db = openChronicleDb(path.join(dir, DATABASE_FILE_NAME))
  events = []
  nextPick = null
  online = true
  secretValue = null
  services = createChronicleServices({
    db,
    libraryRoot,
    emit: (event, payload) => events.push({ event, payload }),
    pickFolder: async () => nextPick,
    secrets: {
      set: (plaintext) => {
        secretValue = plaintext
      },
      has: () => secretValue !== null,
      clear: () => {
        secretValue = null
      },
    },
    isOnline: () => online,
    settleMs: 120, // production keeps the C4 2 s default
  })
})

afterEach(async () => {
  await services.dispose()
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 8_000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function eventsOf<E extends ChronicleEventName>(event: E): Array<ChronicleEvents[E]> {
  return events.filter((e) => e.event === event).map((e) => e.payload as ChronicleEvents[E])
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

function writeFile(name: string, content: Buffer | string): string {
  const filePath = path.join(workDir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

/** Seed one captured version directly (no watcher, no timers). */
async function seedCapture(name: string, content: Buffer): Promise<{ assetId: number; versionId: number }> {
  const file = writeFile(name, content)
  const result = await captureVersion(db, libraryRoot, file)
  if (result.outcome === 'skipped') throw new Error('seed capture skipped')
  return { assetId: result.asset.id, versionId: result.version.id }
}

// ---------------------------------------------------------------------------
// Contract surface
// ---------------------------------------------------------------------------

describe('C1 contract surface', () => {
  it('implements exactly the ChronicleApi method set', () => {
    for (const method of API_METHOD_NAMES) {
      expect(typeof services.api[method], method).toBe('function')
    }
    expect(Object.keys(services.api).sort()).toEqual([...API_METHOD_NAMES].sort())
  })

  it('pending features reject with a clear error instead of pretending', async () => {
    await expect(services.api.restoreVersion(1)).rejects.toThrow(/not implemented/)
    await expect(services.api.saveVersionCopy(1)).rejects.toThrow(/not implemented/)
    await expect(services.api.search('logo')).rejects.toThrow(/not implemented/)
    await expect(services.api.register('a@b.c', 'pw')).rejects.toThrow(/not implemented/)
    await expect(services.api.login('a@b.c', 'pw')).rejects.toThrow(/not implemented/)
  })

  it('account state is local mode; logout is a safe no-op', async () => {
    expect(await services.api.getAccountState()).toEqual({
      mode: 'local',
      email: null,
      isAdmin: false,
    })
    await expect(services.api.logout()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Tracked folders (F2) + watcher → capture wiring
// ---------------------------------------------------------------------------

describe('tracked folders and capture events', () => {
  it('addFolder persists the pick, watches it, and emits statusChanged', async () => {
    nextPick = workDir
    const folder = await services.api.addFolder()
    expect(folder).not.toBeNull()
    expect(folder!.path).toBe(path.resolve(workDir))
    expect(await services.api.listFolders()).toHaveLength(1)
    await waitFor(() => eventsOf('statusChanged').length > 0, 'statusChanged')
    expect((await services.api.getAppStatus()).watchedFolders).toBe(1)
  })

  it('addFolder returns null (and stores nothing) when the picker is cancelled', async () => {
    nextPick = null
    expect(await services.api.addFolder()).toBeNull()
    expect(await services.api.listFolders()).toHaveLength(0)
  })

  it('adding the same folder twice returns the existing row', async () => {
    nextPick = workDir
    const first = await services.api.addFolder()
    const second = await services.api.addFolder()
    expect(second!.id).toBe(first!.id)
    expect(await services.api.listFolders()).toHaveLength(1)
  })

  it('removeFolder stops watching; unknown ids are a no-op', async () => {
    nextPick = workDir
    const folder = await services.api.addFolder()
    await services.api.removeFolder(folder!.id)
    expect(await services.api.listFolders()).toHaveLength(0)
    expect((await services.api.getAppStatus()).watchedFolders).toBe(0)
    await expect(services.api.removeFolder(999)).resolves.toBeUndefined()
    await expect(services.api.removeFolder(1.5)).rejects.toThrow(TypeError)
  })

  it(
    'a save in a watched folder becomes a version and a versionCaptured event',
    async () => {
      nextPick = workDir
      await services.api.addFolder()
      writeFile('logo.png', pngBytes(800, 600))

      await waitFor(() => eventsOf('versionCaptured').length > 0, 'versionCaptured')
      const [captured] = eventsOf('versionCaptured')
      const assets = await services.api.listAssets()
      expect(assets).toHaveLength(1)
      expect(assets[0]!.id).toBe(captured!.assetId)
      expect(chronicleUrlToHash(assets[0]!.thumbnailUrl)).not.toBeNull()
    },
    15_000,
  )

  it(
    'an oversized file emits fileSkipped with only the file name',
    async () => {
      nextPick = workDir
      await services.api.addFolder()
      const big = writeFile('huge.png', 'x')
      fs.truncateSync(big, MAX_FILE_BYTES + 1) // sparse — no real 50 MB write

      await waitFor(() => eventsOf('fileSkipped').length > 0, 'fileSkipped')
      expect(eventsOf('fileSkipped')[0]).toEqual({ fileName: 'huge.png', reason: 'too-large' })
      expect(await services.api.listAssets()).toHaveLength(0)
    },
    15_000,
  )

  it(
    'deleting a captured file marks the asset off-disk, history kept',
    async () => {
      nextPick = workDir
      await services.api.addFolder()
      const file = writeFile('logo.png', pngBytes(10, 10))
      await waitFor(() => eventsOf('versionCaptured').length > 0, 'versionCaptured')

      fs.rmSync(file)
      await waitFor(() => getAssetByPath(db, file)?.onDisk === false, 'off-disk flag')
      const assets = await services.api.listAssets()
      expect(assets[0]!.onDisk).toBe(false)
      expect(assets[0]!.versionCount).toBe(1)
    },
    15_000,
  )
})

// ---------------------------------------------------------------------------
// Assets, timeline, details (F5)
// ---------------------------------------------------------------------------

describe('timeline and version details', () => {
  it('composes VersionSummary newest-first with pending/annotated/restore summaries', async () => {
    const { assetId, versionId: v1 } = await seedCapture('logo.png', pngBytes(800, 600, 'v1'))
    writeFile('logo.png', pngBytes(800, 600, 'v2'))
    await captureVersion(db, libraryRoot, path.join(workDir, 'logo.png'))

    saveAnnotation(db, {
      versionId: v1,
      summary: 'Initial logo on navy background',
      changes: ['first version'],
      tags: ['logo', 'navy'],
      provider: 'anthropic',
      model: 'claude-x',
    })
    // A restore marker (F6): no AI, summary derived from restoredFromVersion.
    appendVersion(db, {
      assetId,
      contentHash: 'a'.repeat(64),
      sizeBytes: 1,
      aiStatus: 'none',
      restoredFromVersion: 1,
    })

    const timeline = await services.api.getTimeline(assetId)
    expect(timeline.map((v) => v.versionNumber)).toEqual([3, 2, 1])
    expect(timeline[0]!.summary).toBe('Restored from version 1')
    expect(timeline[0]!.aiStatus).toBe('none')
    expect(timeline[1]!.summary).toBeNull() // still pending
    expect(timeline[2]!.summary).toBe('Initial logo on navy background')
    for (const v of timeline) expect(chronicleUrlToHash(v.thumbnailUrl)).not.toBeNull()
  })

  it('getVersionDetails returns full C1 shape after annotation', async () => {
    const { versionId } = await seedCapture('logo.png', pngBytes(640, 480))
    saveAnnotation(db, {
      versionId,
      summary: 'Background navy → teal',
      changes: ['background color changed', 'tagline removed'],
      tags: ['teal', 'background'],
      provider: 'anthropic',
      model: 'claude-x',
    })

    const details = await services.api.getVersionDetails(versionId)
    expect(details.width).toBe(640)
    expect(details.height).toBe(480)
    expect(details.aiStatus).toBe('done')
    expect(details.summary).toBe('Background navy → teal')
    expect(details.changes).toHaveLength(2)
    expect(details.tags).toEqual(['teal', 'background'])
    expect(details.aiProvider).toBe('anthropic')
    expect(details.restoredFromVersion).toBeNull()
    expect(chronicleUrlToHash(details.imageUrl)).toBe(details.contentHash)
  })

  it('rejects unknown versions and invalid ids', async () => {
    await expect(services.api.getVersionDetails(12345)).rejects.toThrow(/Unknown version/)
    await expect(services.api.getVersionDetails(0)).rejects.toThrow(TypeError)
    await expect(services.api.getTimeline('x' as unknown as number)).rejects.toThrow(TypeError)
  })

  it('listAssets aggregates count and last summary per asset', async () => {
    const { versionId } = await seedCapture('logo.png', pngBytes(1, 1, 'a'))
    writeFile('logo.png', pngBytes(1, 1, 'b'))
    await captureVersion(db, libraryRoot, path.join(workDir, 'logo.png'))
    await seedCapture('banner.jpg', pngBytes(2, 2))
    saveAnnotation(db, {
      versionId,
      summary: 'v1 summary',
      changes: [],
      tags: [],
      provider: 'p',
      model: 'm',
    })

    const assets = await services.api.listAssets()
    expect(assets).toHaveLength(2)
    const logo = assets.find((a) => a.displayName === 'logo.png')!
    expect(logo.versionCount).toBe(2)
    expect(logo.lastSummary).toBeNull() // latest version is still pending
    expect(logo.lastCapturedAt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// AI retry (F4)
// ---------------------------------------------------------------------------

describe('retryAnnotation', () => {
  it('re-queues a failed version once and emits annotationUpdated', async () => {
    const { versionId } = await seedCapture('logo.png', pngBytes(4, 4))
    setVersionAiStatus(db, versionId, 'failed')

    // The capture-time job is still queued (no worker exists yet) — retry
    // must not duplicate it.
    await services.api.retryAnnotation(versionId)
    expect(listJobs(db, 'ai_annotation')).toHaveLength(1)

    // Once a worker has consumed the job, retry re-queues.
    deleteJob(db, listJobs(db, 'ai_annotation')[0]!.id)
    setVersionAiStatus(db, versionId, 'failed')
    await services.api.retryAnnotation(versionId)
    expect(listJobs(db, 'ai_annotation')).toHaveLength(1)

    expect((await services.api.getVersionDetails(versionId)).aiStatus).toBe('pending')
    expect(eventsOf('annotationUpdated')).toContainEqual({ versionId, aiStatus: 'pending' })
  })

  it('rejects restore markers and unknown versions', async () => {
    const { assetId } = await seedCapture('logo.png', pngBytes(4, 4))
    const restore = appendVersion(db, {
      assetId,
      contentHash: 'b'.repeat(64),
      sizeBytes: 1,
      aiStatus: 'none',
      restoredFromVersion: 1,
    })
    await expect(services.api.retryAnnotation(restore.id)).rejects.toThrow(/restore marker/)
    await expect(services.api.retryAnnotation(99_999)).rejects.toThrow(/Unknown version/)
  })
})

// ---------------------------------------------------------------------------
// Settings + secrets (C5)
// ---------------------------------------------------------------------------

describe('settings and the secret boundary', () => {
  it('returns defaults first, then persists validated patches', async () => {
    expect(await services.api.getSettings()).toEqual(DEFAULT_SETTINGS)

    const updated = await services.api.updateSettings({
      ai: {
        mode: 'local',
        chat: { provider: 'anthropic', model: 'claude-x' },
        embeddings: { provider: 'anthropic', model: 'embed-x' },
      },
    })
    expect(updated.ai.chat.provider).toBe('anthropic')
    expect(updated.controlPlane).toEqual(DEFAULT_SETTINGS.controlPlane) // untouched section
    expect((await services.api.getSettings()).ai.chat.model).toBe('claude-x')
  })

  it('rejects malformed patches', async () => {
    await expect(
      services.api.updateSettings({ bogus: true } as never),
    ).rejects.toThrow(/Unknown settings key/)
    await expect(
      services.api.updateSettings({ ai: { mode: 'cloud' } } as never),
    ).rejects.toThrow(TypeError)
    await expect(
      services.api.updateSettings({
        controlPlane: { baseUrl: 'http://x', telemetryOptIn: 'yes' },
      } as never),
    ).rejects.toThrow(/telemetryOptIn/)
    await expect(services.api.updateSettings('nope' as never)).rejects.toThrow(TypeError)
  })

  it('stores the API key write-only: never readable, never in settings', async () => {
    await expect(services.api.setApiKey('')).rejects.toThrow(/empty/)
    await expect(services.api.setApiKey(42 as unknown as string)).rejects.toThrow(TypeError)

    await services.api.setApiKey('sk-super-secret')
    expect(await services.api.hasApiKey()).toBe(true)
    // The whole renderer-visible settings payload must not contain the key.
    expect(JSON.stringify(await services.api.getSettings())).not.toContain('sk-super-secret')
    // And no C1 method returns it — the api object simply has no getter.
    expect('getApiKey' in services.api).toBe(false)

    await services.api.clearApiKey()
    expect(await services.api.hasApiKey()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// App status
// ---------------------------------------------------------------------------

describe('getAppStatus', () => {
  it('reports watcher count, connectivity, queue depth, and AI readiness', async () => {
    const before = await services.api.getAppStatus()
    expect(before).toEqual({
      watchedFolders: 0,
      online: true,
      pendingJobs: { ai: 0, embedding: 0, telemetry: 0 },
      aiConfigured: false,
    })

    await seedCapture('logo.png', pngBytes(3, 3)) // enqueues one AI job
    online = false
    await services.api.setApiKey('sk-x') // key alone is not "configured"
    expect((await services.api.getAppStatus()).aiConfigured).toBe(false)
    await services.api.updateSettings({
      ai: {
        mode: 'local',
        chat: { provider: 'anthropic', model: 'claude-x' },
        embeddings: { provider: 'anthropic', model: 'embed-x' },
      },
    })

    const after = await services.api.getAppStatus()
    expect(after.online).toBe(false)
    expect(after.pendingJobs.ai).toBe(1)
    expect(after.aiConfigured).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// chronicle:// URL helpers (served by register.ts in production)
// ---------------------------------------------------------------------------

describe('media helpers', () => {
  it('round-trips a hash through the URL', () => {
    const hash = 'ab'.repeat(32)
    expect(chronicleUrlToHash(imageUrlForHash(hash))).toBe(hash)
  })

  it('rejects everything that is not a library hash URL', () => {
    for (const url of [
      'not a url',
      'https://image/aa',
      `chronicle://other/${'a'.repeat(64)}`,
      'chronicle://image/short',
      'chronicle://image/' + 'g'.repeat(64), // not hex
      'chronicle://image/../../etc/passwd',
      `chronicle://image/${'a'.repeat(64)}/extra`,
    ]) {
      expect(chronicleUrlToHash(url), url).toBeNull()
    }
  })

  it('sniffs content types from stored magic bytes', () => {
    expect(sniffImageContentType(pngBytes(1, 1))).toBe('image/png')
    expect(sniffImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageContentType(Buffer.from('plain text'))).toBe('application/octet-stream')
  })
})
