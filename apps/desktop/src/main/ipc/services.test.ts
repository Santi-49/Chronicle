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
  enqueueJob,
  failJob,
  getAnnotation,
  getAssetByPath,
  getEmbedding,
  getSetting,
  getVersion,
  listJobs,
  saveAnnotation,
  saveEmbedding,
  setSetting,
  setVersionAiStatus,
} from '../db/repositories'
import { MAX_FILE_BYTES } from '../watcher/rules'
import { captureVersion, libraryFilePathFor } from '../versioning'
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
let nextSavePath: string | null
let online: boolean
let windowTheme: 'dark' | 'light' | null
let secretKeys: Map<string, string>
let validationCalls: Array<{ task: 'chat' | 'embeddings'; provider: string; model: string }>
let validationValid: boolean

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-ipc-'))
  libraryRoot = path.join(dir, 'library')
  workDir = path.join(dir, 'designs')
  fs.mkdirSync(workDir, { recursive: true })
  db = openChronicleDb(path.join(dir, DATABASE_FILE_NAME))
  events = []
  nextPick = null
  nextSavePath = null
  online = true
  windowTheme = null
  secretKeys = new Map()
  validationCalls = []
  validationValid = true
  services = createChronicleServices({
    db,
    libraryRoot,
    emit: (event, payload) => events.push({ event, payload }),
    pickFolder: async () => nextPick,
    pickVersionCopyPath: async () => nextSavePath,
    secrets: {
      set: (provider, plaintext) => {
        secretKeys.set(provider, plaintext)
      },
      has: (provider) => secretKeys.has(provider),
      clear: (provider) => {
        secretKeys.delete(provider)
      },
      providers: () => [...secretKeys.keys()],
      entries: () => Object.fromEntries(secretKeys),
    },
    isOnline: () => online,
    setWindowTheme: (theme) => {
      windowTheme = theme
    },
    readApiKey: (provider) => secretKeys.get(provider) ?? null,
    aiClient: {
      health: async () => true,
      annotate: async () => { throw new Error('not used in IPC tests') },
      embedText: async () => { throw new Error('not used in IPC tests') },
      validateProviderModel: async ({ task, provider, model }) => {
        validationCalls.push({ task, provider, model })
        return {
          valid: validationValid,
          reachable: validationValid,
          task,
          provider,
          model,
          message: validationValid
            ? 'Provider and model are reachable.'
            : 'The provider rejected the API key or model configuration.',
        }
      },
    },
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
    // Search is implemented (MVP-10) and degrades to keyword-only in this fixture.
    await expect(services.api.search('logo')).resolves.toEqual([])
    await expect(services.api.register('a@b.c', 'pw')).rejects.toThrow(/control plane/)
    await expect(services.api.login('a@b.c', 'pw')).rejects.toThrow(/control plane/)
    await expect(services.api.loginWithGoogle()).rejects.toThrow(/Google sign-in/)
  })

  it('account state is local mode; logout is a safe no-op', async () => {
    expect(await services.api.getAccountState()).toEqual({
      mode: 'local',
      email: null,
      isAdmin: false,
    })
    await expect(services.api.logout()).resolves.toBeUndefined()
  })

  it('validates and applies the native window theme', async () => {
    await services.api.setWindowTheme('light')
    expect(windowTheme).toBe('light')
    await expect(services.api.setWindowTheme('sepia' as never)).rejects.toThrow(TypeError)
    expect(windowTheme).toBe('light')
  })
})

// ---------------------------------------------------------------------------
// Tracked folders (F2) + watcher → capture wiring
// ---------------------------------------------------------------------------

describe('tracked folders and capture events', () => {
  it('pickFolder returns the native pick or null when cancelled', async () => {
    nextPick = workDir
    expect(await services.api.pickFolder()).toBe(workDir)
    nextPick = null
    expect(await services.api.pickFolder()).toBeNull()
  })

  it('addFolder persists the path with defaults, watches it, and emits statusChanged', async () => {
    const folder = await services.api.addFolder(workDir)
    expect(folder.path).toBe(path.resolve(workDir))
    expect(folder.displayName).toBe(path.basename(workDir))
    expect(folder.description).toBe('')
    expect(folder.icon).toBe('folder')
    expect(folder.color).toMatch(/^#/)
    expect(folder.excludedPaths).toEqual([])
    expect(folder.allowedExtensions).toEqual(['.png', '.jpg', '.jpeg'])
    expect(await services.api.listFolders()).toHaveLength(1)
    await waitFor(() => eventsOf('statusChanged').length > 0, 'statusChanged')
    expect((await services.api.getAppStatus()).watchedFolders).toBe(1)
  })

  it('addFolder stores provided presentation metadata', async () => {
    const folder = await services.api.addFolder(workDir, {
      displayName: 'Aurora launch',
      description: 'Spring campaign explorations',
      icon: 'campaign',
      color: '#ee5396',
    })
    expect(folder.displayName).toBe('Aurora launch')
    expect(folder.description).toBe('Spring campaign explorations')
    expect(folder.icon).toBe('campaign')
    expect(folder.color).toBe('#ee5396')
  })

  it('addFolder validates its arguments', async () => {
    await expect(services.api.addFolder(42 as unknown as string)).rejects.toThrow(TypeError)
    await expect(
      services.api.addFolder(workDir, { bogus: 'x' } as never),
    ).rejects.toThrow(/Unknown meta field/)
    await expect(
      services.api.addFolder(workDir, { description: 42 } as never),
    ).rejects.toThrow(/meta\.description must be a string/)
  })

  it('adding the same folder twice returns the existing row', async () => {
    const first = await services.api.addFolder(workDir)
    const second = await services.api.addFolder(workDir)
    expect(second.id).toBe(first.id)
    expect(await services.api.listFolders()).toHaveLength(1)
  })

  it('updateFolder changes presentation fields; unknown ids reject', async () => {
    const folder = await services.api.addFolder(workDir)
    const ignored = path.join(workDir, 'ignored.png')
    const updated = await services.api.updateFolder(folder.id, {
      displayName: 'Renamed',
      description: 'Updated project context',
      color: '#42be65',
      excludedPaths: [ignored],
      allowedExtensions: ['.png'],
    })
    expect(updated.displayName).toBe('Renamed')
    expect(updated.description).toBe('Updated project context')
    expect(updated.color).toBe('#42be65')
    expect(updated.icon).toBe('folder') // untouched
    expect(updated.excludedPaths).toEqual([ignored])
    expect(updated.allowedExtensions).toEqual(['.png'])
    expect((await services.api.listFolders())[0]!.displayName).toBe('Renamed')
    await expect(services.api.updateFolder(999, { displayName: 'x' })).rejects.toThrow(/Unknown folder/)
    await expect(services.api.updateFolder(1.5, {})).rejects.toThrow(TypeError)
  })

  it('removeFolder stops watching and keeps history by default', async () => {
    const capture = await seedCapture('kept.png', pngBytes(20, 20))
    const capturedPath = path.join(workDir, 'kept.png')
    const folder = await services.api.addFolder(workDir, { excludedPaths: [capturedPath] })
    await services.api.removeFolder(folder.id)
    expect(await services.api.listFolders()).toHaveLength(0)
    expect((await services.api.listAssets()).map((asset) => asset.id)).toContain(capture.assetId)
    expect((await services.api.getAppStatus()).watchedFolders).toBe(0)
    await expect(services.api.removeFolder(999)).resolves.toBeUndefined()
    await expect(services.api.removeFolder(1.5)).rejects.toThrow(TypeError)
  })

  it('removeFolder can permanently delete project history and orphaned blobs', async () => {
    const capture = await seedCapture('deleted.png', pngBytes(24, 24))
    const capturedPath = path.join(workDir, 'deleted.png')
    const folder = await services.api.addFolder(workDir, { excludedPaths: [capturedPath] })
    const version = getVersion(db, capture.versionId)!
    const blobPath = libraryFilePathFor(libraryRoot, version.contentHash)
    expect(fs.existsSync(blobPath)).toBe(true)

    await services.api.removeFolder(folder.id, 'delete-history')

    expect(await services.api.listFolders()).toHaveLength(0)
    expect(await services.api.listAssets()).toHaveLength(0)
    expect(getVersion(db, capture.versionId)).toBeUndefined()
    expect(fs.existsSync(blobPath)).toBe(false)
    await expect(
      services.api.removeFolder(1, 'invalid' as never),
    ).rejects.toThrow(/mode must be/)
  })

  it('scanFolder lists supported files with sizes, skipping temp/hidden/unsupported', async () => {
    fs.mkdirSync(path.join(workDir, 'sub'), { recursive: true })
    writeFile('logo.png', pngBytes(10, 10))
    writeFile('sub/banner.jpg', pngBytes(10, 10))
    writeFile('notes.txt', 'ignored')
    writeFile('logo.png.tmp', 'ignored')
    const entries = await services.api.scanFolder(workDir)
    const names = entries.map((e) => e.relativePath.replace(/\\/g, '/')).sort()
    expect(names).toEqual(['logo.png', 'sub/banner.jpg'])
    expect(entries.every((e) => e.sizeBytes > 0)).toBe(true)
  })

  it('addFolder stores excludedPaths/allowedExtensions and the watcher honors them', async () => {
    const keep = writeFile('keep.png', pngBytes(10, 10))
    const skip = writeFile('skip.png', pngBytes(10, 10))
    await services.api.addFolder(workDir, { excludedPaths: [skip], allowedExtensions: ['.png'] })

    await waitFor(() => eventsOf('versionCaptured').length > 0, 'versionCaptured')
    // Give the (excluded) second file the same chance to be captured.
    await new Promise((r) => setTimeout(r, 500))
    const assets = await services.api.listAssets()
    expect(assets.map((a) => a.path).sort()).toEqual([keep])
    expect(assets.some((a) => a.path === skip)).toBe(false)
  }, 15_000)

  it(
    'a save in a watched folder becomes a version and a versionCaptured event',
    async () => {
      await services.api.addFolder(workDir)
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
      await services.api.addFolder(workDir)
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
      await services.api.addFolder(workDir)
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

  it('resets the latest snapshot to a fresh v1 and queues a new initial annotation', async () => {
    const filePath = path.join(workDir, 'reset-logo.png')
    const captures: Array<{ id: number; contentHash: string }> = []
    let assetId = 0
    for (let number = 1; number <= 3; number++) {
      fs.writeFileSync(filePath, pngBytes(30, 20, `v${number}`))
      const result = await captureVersion(db, libraryRoot, filePath)
      if (result.outcome !== 'captured') throw new Error(`v${number} was not captured`)
      assetId = result.asset.id
      captures.push({ id: result.version.id, contentHash: result.version.contentHash })
    }
    const latest = captures[2]!
    saveAnnotation(db, {
      versionId: captures[0]!.id,
      summary: 'Initial annotation',
      changes: [],
      tags: ['initial'],
      provider: 'p',
      model: 'm',
    })
    saveAnnotation(db, {
      versionId: latest.id,
      summary: 'Diff annotation that must be discarded',
      changes: ['changed'],
      tags: ['diff'],
      provider: 'p',
      model: 'm',
    })
    saveEmbedding(db, {
      versionId: latest.id,
      vector: Float32Array.from([1, 2]),
      sourceText: 'old diff',
      model: 'p:m',
    })
    enqueueJob(db, 'embedding', { versionId: latest.id })

    const reset = await services.api.resetAssetHistory(assetId)

    expect(reset.versionId).not.toBe(latest.id)
    const timeline = await services.api.getTimeline(assetId)
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      id: reset.versionId,
      versionNumber: 1,
      aiStatus: 'pending',
      summary: null,
    })
    expect((await services.api.getVersionDetails(reset.versionId)).contentHash).toBe(latest.contentHash)
    for (const old of captures) {
      expect(getVersion(db, old.id)).toBeUndefined()
      expect(getAnnotation(db, old.id)).toBeUndefined()
      expect(getEmbedding(db, old.id)).toBeUndefined()
    }
    // The reset queues exactly one annotation job for the fresh v1. A
    // content-free version_history_reset telemetry job is also enqueued
    // (POST-04), so scope this assertion to the annotation queue.
    expect(listJobs(db, 'ai_annotation')).toHaveLength(1)
    expect(listJobs(db, 'ai_annotation')[0]).toMatchObject({
      jobType: 'ai_annotation',
      payload: { versionId: reset.versionId },
    })
    expect(eventsOf('assetHistoryReset')).toContainEqual({ assetId, versionId: reset.versionId })
  })

  it('rejects reset requests for invalid and unknown assets', async () => {
    await expect(services.api.resetAssetHistory(0)).rejects.toThrow(TypeError)
    await expect(services.api.resetAssetHistory(99_999)).rejects.toThrow(/Unknown asset/)
  })
})

// ---------------------------------------------------------------------------
// Append-only restore + save-copy fallback (F6)
// ---------------------------------------------------------------------------

describe('restore and save copy', () => {
  it('restores v2 from v5 as v6, preserves history, and suppresses the AI job', async () => {
    const filePath = path.join(workDir, 'logo.png')
    const versions = Array.from({ length: 5 }, (_, index) => pngBytes(20, 10, `v${index + 1}`))
    let assetId = 0
    let version2Id = 0
    for (const [index, bytes] of versions.entries()) {
      fs.writeFileSync(filePath, bytes)
      const captured = await captureVersion(db, libraryRoot, filePath)
      if (captured.outcome !== 'captured') throw new Error(`v${index + 1} was not captured`)
      assetId = captured.asset.id
      if (index === 1) version2Id = captured.version.id
    }
    expect(listJobs(db, 'ai_annotation')).toHaveLength(5)

    const result = await services.api.restoreVersion(version2Id)

    expect(result).toEqual({ ok: true, newVersionNumber: 6 })
    expect(fs.readFileSync(filePath)).toEqual(versions[1])
    const timeline = await services.api.getTimeline(assetId)
    expect(timeline).toHaveLength(6)
    expect(timeline[0]).toMatchObject({
      versionNumber: 6,
      aiStatus: 'none',
      summary: 'Restored from version 2',
    })
    expect(listJobs(db, 'ai_annotation')).toHaveLength(5)
    expect(eventsOf('versionCaptured')).toContainEqual({
      assetId,
      versionId: timeline[0]!.id,
    })
  })

  it('returns folder-missing, then saves the selected immutable bytes elsewhere', async () => {
    const bytes = pngBytes(12, 9, 'portable')
    const { versionId } = await seedCapture('missing.png', bytes)
    fs.rmSync(workDir, { recursive: true, force: true })

    await expect(services.api.restoreVersion(versionId)).resolves.toEqual({
      ok: false,
      reason: 'folder-missing',
    })

    nextSavePath = path.join(dir, 'recovered.png')
    await services.api.saveVersionCopy(versionId)
    expect(fs.readFileSync(nextSavePath)).toEqual(bytes)
  })

  it('treats a cancelled save dialog as a no-op and validates version ids', async () => {
    const { versionId } = await seedCapture('logo.png', pngBytes(2, 2))
    nextSavePath = null
    await expect(services.api.saveVersionCopy(versionId)).resolves.toBeUndefined()
    await expect(services.api.restoreVersion(0)).rejects.toThrow(TypeError)
    await expect(services.api.saveVersionCopy(99_999)).rejects.toThrow(/Unknown version/)
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

  it('keeps failed jobs visible and only requeues them on explicit retry', async () => {
    const first = await seedCapture('first.png', pngBytes(4, 4))
    const second = await seedCapture('second.png', pngBytes(5, 5))
    for (const job of listJobs(db, 'ai_annotation')) {
      failJob(db, job.id, {
        message: 'Provider quota exhausted',
        code: 'provider_quota_exceeded',
        status: 429,
      })
    }
    setVersionAiStatus(db, first.versionId, 'failed')
    setVersionAiStatus(db, second.versionId, 'failed')

    const before = await services.api.listPendingJobs()
    expect(before).toHaveLength(2)
    expect(before.every((job) => job.state === 'failed')).toBe(true)
    expect(before[0]?.lastError).toEqual({
      message: 'Provider quota exhausted',
      code: 'provider_quota_exceeded',
      status: 429,
    })
    expect((await services.api.getVersionDetails(first.versionId)).aiFailure).toEqual({
      message: 'Provider quota exhausted',
      code: 'provider_quota_exceeded',
      status: 429,
    })
    expect(await services.api.getAppStatus()).toMatchObject({
      pendingJobs: { ai: 0 },
      failedJobs: 2,
    })

    await expect(services.api.retryAllFailedJobs()).resolves.toBe(2)
    expect(listJobs(db, 'ai_annotation').every((job) => job.status === 'pending')).toBe(true)
    expect((await services.api.getVersionDetails(first.versionId)).aiStatus).toBe('pending')
    expect((await services.api.getVersionDetails(second.versionId)).aiStatus).toBe('pending')
    expect((await services.api.getAppStatus()).failedJobs).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Settings + secrets (C5)
// ---------------------------------------------------------------------------

describe('settings and the secret boundary', () => {
  it('returns defaults first, then persists validated patches', async () => {
    expect(await services.api.getSettings()).toEqual(DEFAULT_SETTINGS)
    await services.api.setApiKey('openai', 'sk-test')

    const updated = await services.api.updateSettings({
      ai: {
        mode: 'local',
        chat: { provider: 'openai', model: 'gpt-4o-mini' },
        embeddings: { provider: 'openai', model: 'text-embedding-3-small' },
      },
    })
    expect(updated.ai.chat.provider).toBe('openai')
    expect(updated.controlPlane).toEqual(DEFAULT_SETTINGS.controlPlane) // untouched section
    expect((await services.api.getSettings()).ai.chat.model).toBe('gpt-4o-mini')
  })

  it('tests the selected provider task without changing saved settings', async () => {
    await services.api.setApiKey('google_genai', 'google-test-key')
    const before = await services.api.getSettings()

    await expect(services.api.testAiConfiguration(
      'chat',
      'google_genai',
      'gemini-flash-latest',
    )).resolves.toMatchObject({
      task: 'chat',
      provider: 'google_genai',
      model: 'gemini-flash-latest',
      valid: true,
    })
    expect(validationCalls).toContainEqual({
      task: 'chat',
      provider: 'google_genai',
      model: 'gemini-flash-latest',
    })
    expect(await services.api.getSettings()).toEqual(before)
    await expect(
      services.api.testAiConfiguration('invalid' as never, 'google_genai', 'model'),
    ).rejects.toThrow(/task must be/)
  })

  it('keeps portable appearance data while migrating the old Google provider alias', async () => {
    setSetting(db, 'app-settings', {
      appearance: { theme: 'dark' },
      ai: {
        ...DEFAULT_SETTINGS.ai,
        chat: { provider: 'google', model: 'gemini-flash-latest' },
        embeddings: { provider: 'google', model: 'gemini-embedding-001' },
      },
      controlPlane: DEFAULT_SETTINGS.controlPlane,
    })

    const expected = {
      ...DEFAULT_SETTINGS,
      appearance: { theme: 'dark' as const },
    }
    expect(await services.api.getSettings()).toEqual(expected)
    expect(getSetting(db, 'app-settings')).toEqual(expected)
  })

  it('queues annotation text for reindexing when the embeddings selection changes', async () => {
    const { versionId } = await seedCapture('banner.jpg', pngBytes(10, 5))
    saveAnnotation(db, {
      versionId,
      summary: 'Discount increased from 40% to 50%.',
      changes: ['Updated discount'],
      tags: ['discount', 'banner'],
      provider: 'google_genai',
      model: 'gemini-flash-latest',
    })
    await services.api.setApiKey('openai', 'sk-openai')
    await services.api.setApiKey('google_genai', 'google-test-key')

    await services.api.updateSettings({
      ai: {
        ...DEFAULT_SETTINGS.ai,
        embeddings: { provider: 'openai', model: 'text-embedding-3-small' },
      },
    })
    expect(listJobs(db, 'embedding').map((job) => job.payload)).toEqual([{ versionId }])

    // A second provider/model change reuses the pending job: it will read the
    // latest settings when the asynchronous worker processes it.
    await services.api.updateSettings({
      ai: {
        ...DEFAULT_SETTINGS.ai,
        embeddings: { provider: 'google_genai', model: 'gemini-embedding-001' },
      },
    })
    expect(listJobs(db, 'embedding')).toHaveLength(1)
  })

  it('migrates unreleased telemetry and settings-sync placeholders once, then preserves opt-outs', async () => {
    setSetting(db, 'app-settings', {
      ...DEFAULT_SETTINGS,
      controlPlane: {
        ...DEFAULT_SETTINGS.controlPlane,
        telemetryOptIn: false,
        settingsSyncEnabled: false,
      },
    })

    expect((await services.api.getSettings()).controlPlane).toMatchObject({
      telemetryOptIn: true,
      settingsSyncEnabled: true,
    })
    await services.api.updateSettings({
      controlPlane: {
        ...DEFAULT_SETTINGS.controlPlane,
        telemetryOptIn: false,
        settingsSyncEnabled: false,
      },
    })
    expect((await services.api.getSettings()).controlPlane).toMatchObject({
      telemetryOptIn: false,
      settingsSyncEnabled: false,
    })
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

  it('rejects an invalid embeddings probe without persisting or reindexing', async () => {
    const before = await services.api.getSettings()
    await services.api.setApiKey('anthropic', 'sk-test')
    validationValid = false
    await expect(
      services.api.updateSettings({
        ai: {
          ...before.ai,
          embeddings: { provider: 'anthropic', model: 'voyage-3' },
        },
      }),
    ).rejects.toThrow(/provider rejected/)

    expect(await services.api.getSettings()).toEqual(before)
    expect(listJobs(db, 'embedding')).toEqual([])
    expect(validationCalls).toEqual([
      { task: 'embeddings', provider: 'anthropic', model: 'voyage-3' },
    ])
  })

  it('requires a saved key before live validation', async () => {
    const before = await services.api.getSettings()
    await expect(
      services.api.updateSettings({
        ai: {
          ...before.ai,
          chat: { provider: 'openai', model: 'gpt-4o-mini' },
        },
      }),
    ).rejects.toThrow(/Save an API key for openai/)

    expect(await services.api.getSettings()).toEqual(before)
    expect(validationCalls).toEqual([])
  })

  it('keeps prior settings when the live provider/model probe fails', async () => {
    const before = await services.api.getSettings()
    await services.api.setApiKey('openai', 'sk-test')
    validationValid = false

    await expect(
      services.api.updateSettings({
        ai: {
          ...before.ai,
          chat: { provider: 'openai', model: 'gpt-4o-mini' },
        },
      }),
    ).rejects.toThrow(/provider rejected/)

    expect(await services.api.getSettings()).toEqual(before)
    expect(validationCalls).toEqual([
      { task: 'chat', provider: 'openai', model: 'gpt-4o-mini' },
    ])
  })

  it('stores API keys per provider, write-only: never readable, never in settings', async () => {
    await expect(services.api.setApiKey('google', '')).rejects.toThrow(/empty/)
    await expect(services.api.setApiKey('', 'sk-x')).rejects.toThrow(/provider/)
    await expect(services.api.setApiKey('google', 42 as unknown as string)).rejects.toThrow(TypeError)

    await services.api.setApiKey('google', 'sk-google-secret')
    await services.api.setApiKey('openai', 'sk-openai-secret')
    expect((await services.api.configuredProviders()).sort()).toEqual(['google', 'openai'])
    // The whole renderer-visible settings payload must not contain any key.
    const settingsJson = JSON.stringify(await services.api.getSettings())
    expect(settingsJson).not.toContain('sk-google-secret')
    expect(settingsJson).not.toContain('sk-openai-secret')
    // And no C1 method returns a key — the api object simply has no getter.
    expect('getApiKey' in services.api).toBe(false)

    await services.api.clearApiKey('google')
    expect(await services.api.configuredProviders()).toEqual(['openai'])
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
      failedJobs: 0,
      aiConfigured: false,
    })

    // Clear the demo provider/model DEFAULT_SETTINGS ships, so the key-alone
    // guard is what's under test (not the default provider).
    await services.api.updateSettings({
      ai: { mode: 'local', chat: { provider: '', model: '' }, embeddings: { provider: '', model: '' } },
    })
    await seedCapture('logo.png', pngBytes(3, 3)) // enqueues one AI job
    online = false
    await services.api.setApiKey('openai', 'sk-x') // key saved, but chat provider is '' → not configured
    expect((await services.api.getAppStatus()).aiConfigured).toBe(false)
    await services.api.updateSettings({
      ai: {
        mode: 'local',
        chat: { provider: 'openai', model: 'gpt-4o-mini' },
        embeddings: { provider: 'openai', model: 'text-embedding-3-small' },
      },
    })

    const after = await services.api.getAppStatus()
    expect(after.online).toBe(false)
    expect(after.pendingJobs.ai).toBe(1)
    expect(after.aiConfigured).toBe(true)
  })

  it('returns renderer-safe pending AI jobs in FIFO order', async () => {
    const capture = await seedCapture('queued-logo.png', pngBytes(8, 6))
    enqueueJob(db, 'embedding', { versionId: capture.versionId })
    enqueueJob(db, 'telemetry', { event: 'version_captured', secret: 'internal' })

    const jobs = await services.api.listPendingJobs()
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.jobType)).toEqual(['ai_annotation', 'embedding'])
    expect(jobs[0]).toMatchObject({
      versionId: capture.versionId,
      assetId: capture.assetId,
      assetName: 'queued-logo.png',
      versionNumber: 1,
      retryCount: 0,
      state: 'pending',
      lastError: null,
    })
    expect(jobs[0]?.thumbnailUrl).toBe((await services.api.getVersionDetails(capture.versionId)).thumbnailUrl)
    expect(JSON.stringify(jobs)).not.toContain('internal')

    const controlPlaneEvents = await services.api.listPendingControlPlaneEvents()
    expect(controlPlaneEvents).toHaveLength(1)
    expect(controlPlaneEvents[0]).toMatchObject({
      retryCount: 0,
      payload: { event: 'version_captured', secret: '[redacted]' },
    })
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
