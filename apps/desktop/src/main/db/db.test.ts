/**
 * MVP-02 acceptance tests (TODO.md): first startup, repeat startup, uniqueness,
 * append-only version numbers, foreign keys, transaction rollback, and
 * JSON/vector round trips. Each test opens a real SQLite file in a temp dir.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_FILE_NAME, openChronicleDb, type ChronicleDb } from './database'
import {
  addTrackedFolder,
  appendVersion,
  bumpJobRetry,
  createAsset,
  deleteJob,
  deleteProjectHistory,
  enqueueEmbeddingReindexJobs,
  enqueueJob,
  failJob,
  getAnnotation,
  getAsset,
  getAssetByPath,
  getEmbedding,
  getLatestVersion,
  getSetting,
  getVersion,
  listAssets,
  listEmbeddings,
  listJobs,
  listTrackedFolders,
  listVersions,
  removeTrackedFolder,
  retryAllFailedAiJobs,
  retryJob,
  saveAnnotation,
  saveEmbedding,
  setAssetOnDisk,
  setSetting,
  setVersionAiStatus,
  updateTrackedFolder,
} from './repositories'

let dir: string
let db: ChronicleDb
let dbPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-db-'))
  dbPath = path.join(dir, DATABASE_FILE_NAME)
  db = openChronicleDb(dbPath)
})

afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Shorthand: one asset with one captured version, ai_status 'pending'. */
function seedAssetWithVersion(assetPath = 'C:\\Designs\\logo.png') {
  const asset = createAsset(db, assetPath)
  const version = appendVersion(db, {
    assetId: asset.id,
    contentHash: 'a'.repeat(64),
    sizeBytes: 1234,
    width: 800,
    height: 600,
  })
  return { asset, version }
}

describe('startup', () => {
  it('first startup creates the database file with all tables and pragmas', () => {
    expect(fs.existsSync(dbPath)).toBe(true)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const table of [
      'tracked_folders',
      'assets',
      'versions',
      'ai_annotations',
      'embeddings',
      'search_index',
      'queue_items',
      'settings',
    ]) {
      expect(tables).toContain(table)
    }
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('user_version', { simple: true })).toBe(6)
  })

  it('repeat startup is idempotent and keeps existing data', () => {
    addTrackedFolder(db, 'C:\\Designs')
    seedAssetWithVersion()
    db.close()

    db = openChronicleDb(dbPath) // second launch, same file
    expect(listTrackedFolders(db)).toHaveLength(1)
    expect(listAssets(db)).toHaveLength(1)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1) // per-connection, must be re-set
  })

  it('reconstructs deleted failed AI jobs when upgrading a v5 database', () => {
    const { version } = seedAssetWithVersion()
    setVersionAiStatus(db, version.id, 'failed')
    db.pragma('user_version = 5')
    db.close()

    db = openChronicleDb(dbPath)

    expect(listJobs(db, 'ai_annotation')).toEqual([
      expect.objectContaining({
        payload: { versionId: version.id },
        retryCount: 3,
        status: 'failed',
        lastError: expect.objectContaining({ code: 'legacy_failure' }),
      }),
    ])
  })
})

describe('tracked folders', () => {
  it('adds, lists, and removes folders', () => {
    const folder = addTrackedFolder(db, 'C:\\Designs', { description: 'Brand exploration' })
    expect(folder.path).toBe('C:\\Designs')
    expect(folder.description).toBe('Brand exploration')
    expect(folder.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    removeTrackedFolder(db, folder.id)
    expect(listTrackedFolders(db)).toHaveLength(0)
  })

  it('defaults descriptions to empty and allows them to be updated', () => {
    const folder = addTrackedFolder(db, 'C:\\Designs')
    expect(folder.description).toBe('')
    expect(updateTrackedFolder(db, folder.id, { description: 'Campaign concepts' })?.description)
      .toBe('Campaign concepts')
  })

  it('rejects a duplicate folder path', () => {
    addTrackedFolder(db, 'C:\\Designs')
    expect(() => addTrackedFolder(db, 'C:\\Designs')).toThrow(/UNIQUE/)
  })

  it('deletes only the selected project history and reports safe orphan blobs', () => {
    const rootPath = path.join(dir, 'designs')
    const nestedPath = path.join(rootPath, 'nested')
    const otherPath = path.join(dir, 'other')
    const root = addTrackedFolder(db, rootPath)
    const nested = addTrackedFolder(db, nestedPath)
    addTrackedFolder(db, otherPath)

    const rootAsset = createAsset(db, path.join(rootPath, 'logo.png'))
    const nestedAsset = createAsset(db, path.join(nestedPath, 'child.png'))
    const otherAsset = createAsset(db, path.join(otherPath, 'shared.png'))
    const sharedHash = 'a'.repeat(64)
    const orphanHash = 'b'.repeat(64)
    const rootVersion = appendVersion(db, {
      assetId: rootAsset.id, contentHash: sharedHash, sizeBytes: 1,
    })
    appendVersion(db, { assetId: rootAsset.id, contentHash: orphanHash, sizeBytes: 2 })
    appendVersion(db, { assetId: nestedAsset.id, contentHash: 'c'.repeat(64), sizeBytes: 3 })
    appendVersion(db, { assetId: otherAsset.id, contentHash: sharedHash, sizeBytes: 1 })
    enqueueJob(db, 'ai_annotation', { versionId: rootVersion.id })

    const result = deleteProjectHistory(db, root.id)

    expect(result).toEqual({
      deletedAssets: 1,
      deletedVersions: 2,
      orphanedContentHashes: [orphanHash],
    })
    expect(getAsset(db, rootAsset.id)).toBeUndefined()
    expect(getAsset(db, nestedAsset.id)).toBeDefined()
    expect(getAsset(db, otherAsset.id)).toBeDefined()
    expect(listTrackedFolders(db).map((folder) => folder.id)).toContain(nested.id)
    expect(listTrackedFolders(db).map((folder) => folder.id)).not.toContain(root.id)
    expect(listJobs(db)).toHaveLength(0)
  })
})

describe('assets', () => {
  it('creates an asset with its display name derived from the path', () => {
    const asset = createAsset(db, 'C:\\Designs\\banners\\hero.png')
    expect(asset.displayName).toBe('hero.png')
    expect(asset.onDisk).toBe(true)
    expect(getAssetByPath(db, 'C:\\Designs\\banners\\hero.png')?.id).toBe(asset.id)
  })

  it('rejects a duplicate asset path (identity = path, F3.7)', () => {
    createAsset(db, 'C:\\Designs\\logo.png')
    expect(() => createAsset(db, 'C:\\Designs\\logo.png')).toThrow(/UNIQUE/)
  })

  it('marks an asset as missing from disk while keeping history', () => {
    const { asset } = seedAssetWithVersion()
    setAssetOnDisk(db, asset.id, false)
    expect(getAsset(db, asset.id)?.onDisk).toBe(false)
    expect(listVersions(db, asset.id)).toHaveLength(1)
  })
})

describe('versions (append-only)', () => {
  it('assigns sequential version numbers per asset', () => {
    const { asset } = seedAssetWithVersion()
    const other = createAsset(db, 'C:\\Designs\\banner.png')
    appendVersion(db, { assetId: asset.id, contentHash: 'b'.repeat(64), sizeBytes: 1 })
    appendVersion(db, { assetId: asset.id, contentHash: 'c'.repeat(64), sizeBytes: 2 })
    const numbers = listVersions(db, asset.id).map((v) => v.versionNumber)
    expect(numbers).toEqual([3, 2, 1]) // newest first
    // an independent asset starts back at 1
    expect(
      appendVersion(db, { assetId: other.id, contentHash: 'd'.repeat(64), sizeBytes: 3 })
        .versionNumber,
    ).toBe(1)
  })

  it('touches the asset last-seen timestamp when a version lands', () => {
    const { asset, version } = seedAssetWithVersion()
    expect(getAsset(db, asset.id)?.lastSeenAt).toBe(version.capturedAt)
  })

  it('enforces UNIQUE (asset_id, version_number)', () => {
    const { asset, version } = seedAssetWithVersion()
    expect(() =>
      db
        .prepare(
          `INSERT INTO versions (asset_id, version_number, content_hash, size_bytes)
           VALUES (?, ?, 'x', 0)`,
        )
        .run(asset.id, version.versionNumber),
    ).toThrow(/UNIQUE/)
  })

  it('rejects a version for a nonexistent asset (foreign keys on)', () => {
    expect(() =>
      appendVersion(db, { assetId: 999, contentHash: 'e'.repeat(64), sizeBytes: 1 }),
    ).toThrow(/FOREIGN KEY/)
  })

  it('records restore captures with no AI job (F6)', () => {
    const { asset } = seedAssetWithVersion()
    const restored = appendVersion(db, {
      assetId: asset.id,
      contentHash: 'a'.repeat(64),
      sizeBytes: 1234,
      aiStatus: 'none',
      restoredFromVersion: 1,
    })
    expect(restored.aiStatus).toBe('none')
    expect(restored.restoredFromVersion).toBe(1)
    expect(getLatestVersion(db, asset.id)?.id).toBe(restored.id)
  })
})

describe('annotations + search index', () => {
  const output = {
    summary: 'Background changed from navy to teal; tagline removed.',
    changes: ['background navy → teal', 'tagline text removed'],
    tags: ['logo', 'teal', 'background'],
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    latencyMs: 1830,
  }

  it('stores the annotation, marks the version done, and indexes it atomically', () => {
    const { version } = seedAssetWithVersion()
    saveAnnotation(db, { versionId: version.id, ...output })

    expect(getVersion(db, version.id)?.aiStatus).toBe('done')
    const stored = getAnnotation(db, version.id)
    expect(stored?.summary).toBe(output.summary)
    expect(stored?.changes).toEqual(output.changes) // JSON round trip
    expect(stored?.tags).toEqual(output.tags)

    const hits = db
      .prepare("SELECT version_id FROM search_index WHERE search_index MATCH 'teal'")
      .all() as Array<{ version_id: number }>
    expect(hits.map((h) => h.version_id)).toEqual([version.id])
  })

  it('replaces the annotation and index row on retry instead of duplicating', () => {
    const { version } = seedAssetWithVersion()
    saveAnnotation(db, { versionId: version.id, ...output })
    saveAnnotation(db, { versionId: version.id, ...output, summary: 'Second attempt.' })

    expect(getAnnotation(db, version.id)?.summary).toBe('Second attempt.')
    const rows = db
      .prepare('SELECT COUNT(*) AS n FROM search_index WHERE version_id = ?')
      .get(version.id) as { n: number }
    expect(rows.n).toBe(1)
  })

  it('rolls back every write when a later statement in the transaction fails', () => {
    const { version } = seedAssetWithVersion()
    db.exec('DROP TABLE search_index') // force the final statement to fail
    expect(() => saveAnnotation(db, { versionId: version.id, ...output })).toThrow()
    // the earlier annotation insert and status update were rolled back
    expect(getAnnotation(db, version.id)).toBeUndefined()
    expect(getVersion(db, version.id)?.aiStatus).toBe('pending')
  })

  it('supports the failed → retry status flow (F4)', () => {
    const { version } = seedAssetWithVersion()
    setVersionAiStatus(db, version.id, 'failed')
    expect(getVersion(db, version.id)?.aiStatus).toBe('failed')
    expect(() => setVersionAiStatus(db, version.id, 'bogus' as never)).toThrow(/CHECK/)
  })
})

describe('embeddings', () => {
  it('round-trips a float32 vector exactly', () => {
    const { version } = seedAssetWithVersion()
    const vector = new Float32Array([0.25, -1.5, 3.125, 0, 1e-7, -0.000123])
    saveEmbedding(db, {
      versionId: version.id,
      vector,
      sourceText: 'logo teal background',
      model: 'text-embedding-3-small',
    })
    const stored = getEmbedding(db, version.id)
    expect(stored?.vector).toEqual(vector)
    expect(stored?.sourceText).toBe('logo teal background')
  })

  it('scopes similarity scans to one embedding model', () => {
    const { asset, version } = seedAssetWithVersion()
    const v2 = appendVersion(db, { assetId: asset.id, contentHash: 'f'.repeat(64), sizeBytes: 9 })
    saveEmbedding(db, {
      versionId: version.id,
      vector: new Float32Array([1, 2]),
      sourceText: 'a',
      model: 'model-a',
    })
    saveEmbedding(db, {
      versionId: v2.id,
      vector: new Float32Array([3, 4]),
      sourceText: 'b',
      model: 'model-b',
    })
    const scan = listEmbeddings(db, 'model-a')
    expect(scan).toHaveLength(1)
    expect(scan[0]?.versionId).toBe(version.id)
  })
})

describe('offline queue', () => {
  it('round-trips JSON payloads in FIFO order with retry counts', () => {
    const first = enqueueJob(db, 'ai_annotation', { versionId: 1, previousVersionId: null })
    enqueueJob(db, 'embedding', { versionId: 1 })
    enqueueJob(db, 'telemetry', { event: 'version_captured' })

    expect(listJobs(db).map((j) => j.jobType)).toEqual(['ai_annotation', 'embedding', 'telemetry'])
    expect(listJobs(db, 'ai_annotation')[0]?.payload).toEqual({
      versionId: 1,
      previousVersionId: null,
    })

    bumpJobRetry(db, first.id)
    expect(listJobs(db, 'ai_annotation')[0]?.retryCount).toBe(1)
    failJob(db, first.id, { message: 'Quota exceeded', code: 'quota', status: 429 })
    expect(listJobs(db, 'ai_annotation')[0]).toMatchObject({
      status: 'failed',
      retryCount: 2,
      lastError: { message: 'Quota exceeded', code: 'quota', status: 429 },
    })
    retryJob(db, first.id)
    expect(listJobs(db, 'ai_annotation')[0]).toMatchObject({
      status: 'pending',
      retryCount: 0,
      lastError: null,
    })
    failJob(db, first.id, { message: 'Quota exceeded', code: 'quota', status: 429 })
    expect(retryAllFailedAiJobs(db).map((job) => job.id)).toEqual([first.id])
    expect(listJobs(db, 'ai_annotation')[0]?.status).toBe('pending')
    deleteJob(db, first.id)
    expect(listJobs(db, 'ai_annotation')).toHaveLength(0)
  })

  it('rejects unknown job types (CHECK constraint)', () => {
    expect(() => enqueueJob(db, 'bogus' as never, {})).toThrow(/CHECK/)
  })
})

describe('settings', () => {
  it('round-trips nested JSON values and overwrites per key', () => {
    const value = {
      ai: {
        mode: 'local',
        chat: { provider: 'anthropic', model: 'claude-sonnet-5' },
        embeddings: { provider: 'openai', model: 'text-embedding-3-small' },
      },
      controlPlane: {
        baseUrl: 'http://localhost:8000', telemetryOptIn: true,
        settingsSyncEnabled: false, apiKeySyncEnabled: false,
      },
    }
    setSetting(db, 'app', value)
    expect(getSetting(db, 'app')).toEqual(value)

    setSetting(db, 'app', { ...value, controlPlane: { ...value.controlPlane, telemetryOptIn: true } })
    expect(getSetting<typeof value>(db, 'app')?.controlPlane.telemetryOptIn).toBe(true)
    expect(getSetting(db, 'missing')).toBeUndefined()
  })
})

describe('embedding reindex queue', () => {
  it('queues each annotated version once and ignores unannotated versions', () => {
    const { version } = seedAssetWithVersion()
    saveAnnotation(db, {
      versionId: version.id,
      summary: 'Discount changed.',
      changes: ['40% to 50%'],
      tags: ['discount'],
      provider: 'google_genai',
      model: 'gemini-flash-latest',
    })
    saveEmbedding(db, {
      versionId: version.id,
      vector: Float32Array.from([1, 0]),
      sourceText: 'Discount changed.\ndiscount',
      model: 'google_genai:gemini-embedding-001',
    })
    appendVersion(db, {
      assetId: version.assetId,
      contentHash: 'c'.repeat(64),
      sizeBytes: 3,
    })

    expect(enqueueEmbeddingReindexJobs(db)).toBe(1)
    expect(enqueueEmbeddingReindexJobs(db)).toBe(0)
    expect(listJobs(db, 'embedding').map((job) => job.payload)).toEqual([
      { versionId: version.id },
    ])
  })
})

describe('asset list aggregates (C1 AssetSummary source)', () => {
  it('reports version count, last capture, and last summary per asset', () => {
    const { asset, version } = seedAssetWithVersion()
    saveAnnotation(db, {
      versionId: version.id,
      summary: 'Initial logo on navy background.',
      changes: [],
      tags: ['logo'],
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    })
    const v2 = appendVersion(db, { assetId: asset.id, contentHash: 'b'.repeat(64), sizeBytes: 2 })
    saveAnnotation(db, {
      versionId: v2.id,
      summary: 'Background navy → teal.',
      changes: ['background color'],
      tags: ['teal'],
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    })

    const [item] = listAssets(db)
    expect(item?.versionCount).toBe(2)
    expect(item?.lastCapturedAt).toBe(getVersion(db, v2.id)?.capturedAt)
    expect(item?.lastSummary).toBe('Background navy → teal.')
  })

  it('labels restore captures without an annotation (F6 message)', () => {
    const { asset } = seedAssetWithVersion()
    appendVersion(db, {
      assetId: asset.id,
      contentHash: 'a'.repeat(64),
      sizeBytes: 1234,
      aiStatus: 'none',
      restoredFromVersion: 1,
    })
    expect(listAssets(db)[0]?.lastSummary).toBe('Restored from version 1')
  })
})
