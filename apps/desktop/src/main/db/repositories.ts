/**
 * C2 implementation — small repository functions over the Chronicle database.
 *
 * Callers (versioning, search, IPC handlers) compose these into the C1 view
 * shapes; nothing here reaches the renderer directly. File bytes never enter
 * SQLite — versions reference the content-addressed library by hash.
 */
import path from 'node:path'
import type { AiStatus, FolderMetaPatch, TrackedFolder } from '../../shared/ipc'
import { WATCHED_EXTENSIONS } from '../watcher/rules'
import type { ChronicleDb } from './database'

// ── Domain records (snake_case rows mapped to camelCase) ────────────────

export interface AssetRecord {
  id: number
  path: string
  displayName: string
  createdAt: string
  lastSeenAt: string | null
  onDisk: boolean
}

/** Asset plus the aggregates handlers need to build C1 `AssetSummary`. */
export interface AssetListItem extends AssetRecord {
  versionCount: number
  lastCapturedAt: string | null
  lastSummary: string | null
}

export interface VersionRecord {
  id: number
  assetId: number
  versionNumber: number
  contentHash: string
  capturedAt: string
  sizeBytes: number
  width: number | null
  height: number | null
  aiStatus: AiStatus
  restoredFromVersion: number | null
}

export interface NewVersion {
  assetId: number
  contentHash: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  /** Defaults to 'pending'; restore captures pass 'none' (F6 — no AI job). */
  aiStatus?: AiStatus
  restoredFromVersion?: number | null
}

export interface AnnotationRecord {
  versionId: number
  summary: string
  changes: string[]
  tags: string[]
  provider: string
  model: string
  latencyMs: number | null
  createdAt: string
}

export type NewAnnotation = Omit<AnnotationRecord, 'createdAt' | 'latencyMs'> & {
  latencyMs?: number | null
}

export interface EmbeddingRecord {
  versionId: number
  vector: Float32Array
  sourceText: string
  model: string
}

export type JobType = 'ai_annotation' | 'embedding' | 'telemetry'

export interface QueueItem {
  id: number
  jobType: JobType
  payload: unknown
  retryCount: number
  createdAt: string
}

// ── Tracked folders (F2) ────────────────────────────────────────────────

interface TrackedFolderRow {
  id: number
  path: string
  added_at: string
  display_name: string
  description: string
  icon: string
  color: string
  excluded_paths: string
  allowed_extensions: string
}

/** Every extension Chronicle can capture today (the default enabled set). */
const SUPPORTED_EXTENSIONS: string[] = [...WATCHED_EXTENSIONS]

/** Parse a JSON string-array column, tolerating null/garbage from older rows. */
function parseStringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function toTrackedFolder(row: TrackedFolderRow): TrackedFolder {
  const allowed = parseStringArray(row.allowed_extensions)
  return {
    id: row.id,
    path: row.path,
    addedAt: row.added_at,
    // Older rows (or default column values) may carry an empty name — fall
    // back to the base name so the renderer always has something to show.
    displayName: row.display_name || path.basename(row.path),
    description: row.description || '',
    icon: row.icon,
    color: row.color,
    excludedPaths: parseStringArray(row.excluded_paths),
    // Empty stored set means "all supported types" (default / legacy rows).
    allowedExtensions: allowed.length > 0 ? allowed : [...SUPPORTED_EXTENSIONS],
  }
}

export function listTrackedFolders(db: ChronicleDb): TrackedFolder[] {
  const rows = db
    .prepare('SELECT * FROM tracked_folders ORDER BY id')
    .all() as TrackedFolderRow[]
  return rows.map(toTrackedFolder)
}

export function getTrackedFolder(db: ChronicleDb, folderId: number): TrackedFolder | undefined {
  const row = db.prepare('SELECT * FROM tracked_folders WHERE id = ?').get(folderId) as
    | TrackedFolderRow
    | undefined
  return row && toTrackedFolder(row)
}

export function addTrackedFolder(
  db: ChronicleDb,
  folderPath: string,
  meta: FolderMetaPatch = {},
): TrackedFolder {
  const info = db
    .prepare(
      `INSERT INTO tracked_folders
         (path, display_name, description, icon, color, excluded_paths, allowed_extensions)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      folderPath,
      meta.displayName ?? path.basename(folderPath),
      meta.description ?? '',
      meta.icon ?? 'folder',
      meta.color ?? '#4589ff',
      JSON.stringify(meta.excludedPaths ?? []),
      // '[]' is fine — toTrackedFolder expands it to all supported types.
      JSON.stringify(meta.allowedExtensions ?? []),
    )
  return getTrackedFolder(db, info.lastInsertRowid as number)!
}

/** Updates presentation fields; only provided keys change. Returns the updated row. */
export function updateTrackedFolder(
  db: ChronicleDb,
  folderId: number,
  patch: FolderMetaPatch,
): TrackedFolder | undefined {
  const sets: string[] = []
  const values: unknown[] = []
  if (patch.displayName !== undefined) {
    sets.push('display_name = ?')
    values.push(patch.displayName)
  }
  if (patch.description !== undefined) {
    sets.push('description = ?')
    values.push(patch.description)
  }
  if (patch.icon !== undefined) {
    sets.push('icon = ?')
    values.push(patch.icon)
  }
  if (patch.color !== undefined) {
    sets.push('color = ?')
    values.push(patch.color)
  }
  if (patch.excludedPaths !== undefined) {
    sets.push('excluded_paths = ?')
    values.push(JSON.stringify(patch.excludedPaths))
  }
  if (patch.allowedExtensions !== undefined) {
    sets.push('allowed_extensions = ?')
    values.push(JSON.stringify(patch.allowedExtensions))
  }
  if (sets.length > 0) {
    values.push(folderId)
    db.prepare(`UPDATE tracked_folders SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  return getTrackedFolder(db, folderId)
}

export function removeTrackedFolder(db: ChronicleDb, folderId: number): void {
  db.prepare('DELETE FROM tracked_folders WHERE id = ?').run(folderId)
}

// ── Assets (identity = path, spec F3.7) ─────────────────────────────────

interface AssetRow {
  id: number
  path: string
  display_name: string
  created_at: string
  last_seen_at: string | null
  on_disk: number
}

function toAsset(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    path: row.path,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    onDisk: row.on_disk === 1,
  }
}

export function getAsset(db: ChronicleDb, assetId: number): AssetRecord | undefined {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as AssetRow | undefined
  return row && toAsset(row)
}

export function getAssetByPath(db: ChronicleDb, assetPath: string): AssetRecord | undefined {
  const row = db.prepare('SELECT * FROM assets WHERE path = ?').get(assetPath) as
    | AssetRow
    | undefined
  return row && toAsset(row)
}

export function createAsset(db: ChronicleDb, assetPath: string): AssetRecord {
  const info = db
    .prepare('INSERT INTO assets (path, display_name) VALUES (?, ?)')
    .run(assetPath, path.basename(assetPath))
  return getAsset(db, info.lastInsertRowid as number)!
}

/** Marks whether the tracked file still exists on disk (history is kept either way). */
export function setAssetOnDisk(db: ChronicleDb, assetId: number, onDisk: boolean): void {
  db.prepare('UPDATE assets SET on_disk = ? WHERE id = ?').run(onDisk ? 1 : 0, assetId)
}

/** Assets with the aggregates the Assets screen needs, most recently captured first. */
export function listAssets(db: ChronicleDb): AssetListItem[] {
  const rows = db
    .prepare(
      `SELECT a.*,
              COUNT(v.id) AS version_count,
              MAX(v.captured_at) AS last_captured_at,
              (SELECT COALESCE(an.summary,
                               CASE WHEN v2.restored_from_version IS NOT NULL
                                    THEN 'Restored from version ' || v2.restored_from_version END)
                 FROM versions v2
                 LEFT JOIN ai_annotations an ON an.version_id = v2.id
                WHERE v2.asset_id = a.id
                ORDER BY v2.version_number DESC LIMIT 1) AS last_summary
         FROM assets a
         LEFT JOIN versions v ON v.asset_id = a.id
        GROUP BY a.id
        ORDER BY last_captured_at DESC`,
    )
    .all() as Array<
    AssetRow & { version_count: number; last_captured_at: string | null; last_summary: string | null }
  >
  return rows.map((r) => ({
    ...toAsset(r),
    versionCount: r.version_count,
    lastCapturedAt: r.last_captured_at,
    lastSummary: r.last_summary,
  }))
}

// ── Versions (F3 — append-only) ─────────────────────────────────────────

interface VersionRow {
  id: number
  asset_id: number
  version_number: number
  content_hash: string
  captured_at: string
  size_bytes: number
  width: number | null
  height: number | null
  ai_status: AiStatus
  restored_from_version: number | null
}

function toVersion(row: VersionRow): VersionRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    versionNumber: row.version_number,
    contentHash: row.content_hash,
    capturedAt: row.captured_at,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    aiStatus: row.ai_status,
    restoredFromVersion: row.restored_from_version,
  }
}

/**
 * Appends the next version of an asset (1..N during normal capture) and
 * touches the asset's last-seen/on-disk state in the same transaction.
 */
export function appendVersion(db: ChronicleDb, input: NewVersion): VersionRecord {
  const id = db.transaction((v: NewVersion): number => {
    const { next } = db
      .prepare(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM versions WHERE asset_id = ?',
      )
      .get(v.assetId) as { next: number }
    const info = db
      .prepare(
        `INSERT INTO versions
           (asset_id, version_number, content_hash, size_bytes, width, height, ai_status, restored_from_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        v.assetId,
        next,
        v.contentHash,
        v.sizeBytes,
        v.width ?? null,
        v.height ?? null,
        v.aiStatus ?? 'pending',
        v.restoredFromVersion ?? null,
      )
    db.prepare(
      `UPDATE assets
          SET last_seen_at = (SELECT captured_at FROM versions WHERE id = ?), on_disk = 1
        WHERE id = ?`,
    ).run(info.lastInsertRowid, v.assetId)
    return info.lastInsertRowid as number
  })(input)
  return getVersion(db, id)!
}

export function getVersion(db: ChronicleDb, versionId: number): VersionRecord | undefined {
  const row = db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId) as
    | VersionRow
    | undefined
  return row && toVersion(row)
}

export function getLatestVersion(db: ChronicleDb, assetId: number): VersionRecord | undefined {
  const row = db
    .prepare('SELECT * FROM versions WHERE asset_id = ? ORDER BY version_number DESC LIMIT 1')
    .get(assetId) as VersionRow | undefined
  return row && toVersion(row)
}

/** Timeline order: newest first (F5). */
export function listVersions(db: ChronicleDb, assetId: number): VersionRecord[] {
  const rows = db
    .prepare('SELECT * FROM versions WHERE asset_id = ? ORDER BY version_number DESC')
    .all(assetId) as VersionRow[]
  return rows.map(toVersion)
}

export interface ResetAssetHistoryResult {
  version: VersionRecord
  removedVersionIds: number[]
}

/**
 * Explicit destructive reset: the latest immutable snapshot becomes a fresh
 * v1, all prior version-scoped metadata is removed, and a new initial
 * annotation job is queued. A fresh row id isolates the baseline from any
 * stale AI request that was already processing an old version id.
 */
export function resetAssetHistory(db: ChronicleDb, assetId: number): ResetAssetHistoryResult {
  const asset = getAsset(db, assetId)
  if (!asset) throw new Error(`Unknown asset: ${assetId}`)
  const latest = getLatestVersion(db, assetId)
  if (!latest) throw new Error(`Asset ${assetId} has no versions`)

  return db.transaction(() => {
    const oldVersions = listVersions(db, assetId)
    const oldIds = new Set(oldVersions.map((version) => version.id))
    // Insert while the old ids still exist so SQLite must allocate a genuinely
    // fresh id. It is temporarily N+1 and becomes v1 after old rows are gone.
    const insertedBaseline = appendVersion(db, {
      assetId,
      contentHash: latest.contentHash,
      sizeBytes: latest.sizeBytes,
      width: latest.width,
      height: latest.height,
      aiStatus: 'pending',
      restoredFromVersion: null,
    })

    // Queue rows are JSON-linked rather than foreign-keyed. Remove only AI
    // work for this asset's old version ids; unrelated telemetry is retained.
    for (const job of listJobs(db)) {
      if (job.jobType !== 'ai_annotation' && job.jobType !== 'embedding') continue
      const payload = job.payload as { versionId?: unknown } | null
      if (typeof payload?.versionId === 'number' && oldIds.has(payload.versionId)) {
        deleteJob(db, job.id)
      }
    }

    const deleteForVersion = {
      search: db.prepare('DELETE FROM search_index WHERE version_id = ?'),
      annotations: db.prepare('DELETE FROM ai_annotations WHERE version_id = ?'),
      embeddings: db.prepare('DELETE FROM embeddings WHERE version_id = ?'),
    }
    for (const versionId of oldIds) {
      deleteForVersion.search.run(versionId)
      deleteForVersion.annotations.run(versionId)
      deleteForVersion.embeddings.run(versionId)
    }
    db.prepare('DELETE FROM versions WHERE asset_id = ? AND id <> ?').run(assetId, insertedBaseline.id)
    db.prepare('UPDATE versions SET version_number = 1 WHERE id = ?').run(insertedBaseline.id)
    const baseline = getVersion(db, insertedBaseline.id)!
    // appendVersion proves the snapshot is available, not that the original
    // file still exists. Preserve the asset's prior on-disk state.
    if (!asset.onDisk) setAssetOnDisk(db, assetId, false)
    enqueueJob(db, 'ai_annotation', { versionId: baseline.id })

    return { version: baseline, removedVersionIds: [...oldIds] }
  })()
}

export function setVersionAiStatus(db: ChronicleDb, versionId: number, status: AiStatus): void {
  db.prepare('UPDATE versions SET ai_status = ? WHERE id = ?').run(status, versionId)
}

// ── AI annotations (F4) + keyword index row (F7) ────────────────────────

/**
 * Stores the AI output for a version, marks it 'done', and (re)writes its
 * keyword-search row — atomically. Replaces any previous annotation (retry).
 */
export function saveAnnotation(db: ChronicleDb, annotation: NewAnnotation): void {
  db.transaction((a: NewAnnotation) => {
    db.prepare(
      `INSERT OR REPLACE INTO ai_annotations
         (version_id, summary, changes, tags, provider, model, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      a.versionId,
      a.summary,
      JSON.stringify(a.changes),
      JSON.stringify(a.tags),
      a.provider,
      a.model,
      a.latencyMs ?? null,
    )
    db.prepare("UPDATE versions SET ai_status = 'done' WHERE id = ?").run(a.versionId)
    const { name } = db
      .prepare(
        `SELECT s.display_name AS name
           FROM versions v JOIN assets s ON s.id = v.asset_id
          WHERE v.id = ?`,
      )
      .get(a.versionId) as { name: string }
    db.prepare('DELETE FROM search_index WHERE version_id = ?').run(a.versionId)
    db.prepare(
      `INSERT INTO search_index (version_id, asset_name, summary, changes, tags)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(a.versionId, name, a.summary, a.changes.join(' '), a.tags.join(' '))
  })(annotation)
}

export function getAnnotation(db: ChronicleDb, versionId: number): AnnotationRecord | undefined {
  const row = db.prepare('SELECT * FROM ai_annotations WHERE version_id = ?').get(versionId) as
    | {
        version_id: number
        summary: string
        changes: string
        tags: string
        provider: string
        model: string
        latency_ms: number | null
        created_at: string
      }
    | undefined
  if (!row) return undefined
  return {
    versionId: row.version_id,
    summary: row.summary,
    changes: JSON.parse(row.changes) as string[],
    tags: JSON.parse(row.tags) as string[],
    provider: row.provider,
    model: row.model,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }
}

// ── Embeddings (F7 semantic) ────────────────────────────────────────────
// Vectors are stored as raw float32 bytes. Encoding/decoding copies the data,
// so alignment and buffer pooling never bite; all target platforms are
// little-endian, matching the schema's documented layout.

function encodeVector(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength))
}

function decodeVector(blob: Buffer): Float32Array {
  const vector = new Float32Array(blob.byteLength / 4)
  new Uint8Array(vector.buffer).set(blob)
  return vector
}

export function saveEmbedding(db: ChronicleDb, embedding: EmbeddingRecord): void {
  db.prepare(
    `INSERT OR REPLACE INTO embeddings (version_id, vector, source_text, model)
     VALUES (?, ?, ?, ?)`,
  ).run(embedding.versionId, encodeVector(embedding.vector), embedding.sourceText, embedding.model)
}

export function getEmbedding(db: ChronicleDb, versionId: number): EmbeddingRecord | undefined {
  const row = db.prepare('SELECT * FROM embeddings WHERE version_id = ?').get(versionId) as
    | { version_id: number; vector: Buffer; source_text: string; model: string }
    | undefined
  if (!row) return undefined
  return {
    versionId: row.version_id,
    vector: decodeVector(row.vector),
    sourceText: row.source_text,
    model: row.model,
  }
}

/** Only vectors from one model are comparable — the scan is always model-scoped. */
export function listEmbeddings(
  db: ChronicleDb,
  model: string,
): Array<{ versionId: number; vector: Float32Array }> {
  const rows = db
    .prepare('SELECT version_id, vector FROM embeddings WHERE model = ?')
    .all(model) as Array<{ version_id: number; vector: Buffer }>
  return rows.map((r) => ({ versionId: r.version_id, vector: decodeVector(r.vector) }))
}

// ── Offline queue (F4/F7/F8) ────────────────────────────────────────────

export function enqueueJob(db: ChronicleDb, jobType: JobType, payload: unknown): QueueItem {
  const info = db
    .prepare('INSERT INTO queue_items (job_type, payload) VALUES (?, ?)')
    .run(jobType, JSON.stringify(payload ?? null))
  return listJobs(db).find((j) => j.id === info.lastInsertRowid)!
}

/** FIFO order; optionally filtered by job type. */
export function listJobs(db: ChronicleDb, jobType?: JobType): QueueItem[] {
  const rows = (
    jobType
      ? db.prepare('SELECT * FROM queue_items WHERE job_type = ? ORDER BY id').all(jobType)
      : db.prepare('SELECT * FROM queue_items ORDER BY id').all()
  ) as Array<{
    id: number
    job_type: JobType
    payload: string
    retry_count: number
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    jobType: r.job_type,
    payload: JSON.parse(r.payload) as unknown,
    retryCount: r.retry_count,
    createdAt: r.created_at,
  }))
}

export function deleteJob(db: ChronicleDb, jobId: number): void {
  db.prepare('DELETE FROM queue_items WHERE id = ?').run(jobId)
}

export function bumpJobRetry(db: ChronicleDb, jobId: number): void {
  db.prepare('UPDATE queue_items SET retry_count = retry_count + 1 WHERE id = ?').run(jobId)
}

// ── Settings (C5 — JSON per key; secrets NEVER stored here) ─────────────

export function getSetting<T>(db: ChronicleDb, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row === undefined ? undefined : (JSON.parse(row.value) as T)
}

export function setSetting(db: ChronicleDb, key: string, value: unknown): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    JSON.stringify(value),
  )
}
