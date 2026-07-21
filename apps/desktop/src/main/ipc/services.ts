/**
 * C1 implementation (MVP-05) — every `ChronicleApi` method plus the
 * watcher → capture wiring that produces the C1 push events.
 *
 * Electron-free by dependency injection, like db/ and versioning/: the
 * Electron pieces (dialog, safeStorage, protocol, ipcMain, connectivity)
 * arrive as `deps` from register.ts, so the whole surface is testable
 * against a real temp database and library.
 *
 * Renderer inputs are validated here (ids, strings, settings patches) —
 * the preload bridge forwards arguments verbatim, so this is the boundary
 * where untrusted renderer data is checked.
 *
 * Not yet implemented (handlers reject with a clear error, tracked in
 * apps/desktop/README.md): search (MVP-10) and register/login (F1 — low
 * priority; local mode always works).
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import type {
  AppStatus,
  AssetSummary,
  ChronicleApi,
  FolderMetaPatch,
  FolderScanEntry,
  PendingJob,
  TrackedFolder,
  VersionDetails,
  VersionSummary,
} from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import type { ChronicleDb } from '../db/database'
import {
  addTrackedFolder,
  getAsset,
  getAnnotation,
  getVersion,
  listAssets,
  listJobs,
  listTrackedFolders,
  listVersions,
  getLatestVersion,
  getSetting,
  setSetting,
  setVersionAiStatus,
  deleteProjectHistory,
  removeTrackedFolder,
  resetAssetHistory as resetStoredAssetHistory,
  updateTrackedFolder,
  enqueueJob,
  type JobType,
  type VersionRecord,
} from '../db/repositories'
import { createFolderWatcher, type FolderWatcher } from '../watcher/watcher'
import { hasWatchedExtension, isHiddenPath, isTemporaryPath } from '../watcher/evaluate'
import {
  captureVersion,
  markFileMissing,
  restoreVersion as restoreStoredVersion,
  saveVersionCopy as copyStoredVersion,
  libraryFilePathFor,
} from '../versioning'
import type { EmitEvent } from './channels'
import { imageUrlForHash } from './media'
import type { SecretStore } from './secrets'

// ── Settings defaults (implementation policy per C5, not contract) ──────

const SETTINGS_KEY = 'app-settings'

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    mode: 'local',
    // Default demo provider/model (Google Gemini) — validated in RESEARCH.md's
    // live acceptance. This is configuration, not code: the engine stays
    // model-agnostic (spec §6.4) and the user can switch provider/model in
    // Settings. AI stays inert until an API key is also configured.
    chat: { provider: 'google', model: 'gemini-flash-latest' },
    embeddings: { provider: 'google', model: 'gemini-embedding-001' },
  },
  controlPlane: {
    baseUrl: 'http://localhost:8000',
    telemetryOptIn: false,
  },
}

// ── Dependencies (Electron bits injected by register.ts) ────────────────

export interface ChronicleServicesDeps {
  db: ChronicleDb
  libraryRoot: string
  emit: EmitEvent
  /** Native folder picker; resolves null when the user cancels (C1 addFolder). */
  pickFolder: () => Promise<string | null>
  /** Native save picker for F6; receives the original file name as its default. */
  pickVersionCopyPath: (suggestedName: string) => Promise<string | null>
  secrets: SecretStore
  isOnline: () => boolean
  /** Test-only overrides; production uses the C4 settle default and initial scan. */
  settleMs?: number
  emitInitial?: boolean
}

export interface ChronicleServices {
  api: ChronicleApi
  /** Begin watching every tracked folder (call once at startup). */
  start(): void
  dispose(): Promise<void>
}

// ── Renderer input validation ───────────────────────────────────────────

function expectId(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`)
  }
  return value
}

function expectString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`)
  return value
}

function expectProjectRemovalMode(value: unknown): 'keep-history' | 'delete-history' {
  if (value === undefined || value === 'keep-history') return 'keep-history'
  if (value === 'delete-history') return value
  throw new TypeError("mode must be 'keep-history' or 'delete-history'")
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new TypeError(`${name} must be an array of strings`)
  }
  return value as string[]
}

/** Validates a C1 FolderMetaPatch: presentation strings + tracking-selection arrays. */
function expectFolderMeta(value: unknown, name: string): FolderMetaPatch {
  if (value === undefined) return {}
  if (!isPlainObject(value)) throw new TypeError(`${name} must be an object`)
  const patch: FolderMetaPatch = {}
  for (const key of Object.keys(value)) {
    if (key === 'displayName' || key === 'description' || key === 'icon' || key === 'color') {
      patch[key] = expectString(value[key], `${name}.${key}`)
    } else if (key === 'excludedPaths') {
      patch.excludedPaths = expectStringArray(value[key], `${name}.excludedPaths`).map((p) =>
        path.resolve(p),
      )
    } else if (key === 'allowedExtensions') {
      patch.allowedExtensions = expectStringArray(value[key], `${name}.allowedExtensions`).map((e) =>
        e.toLowerCase(),
      )
    } else {
      throw new TypeError(`Unknown ${name} field: ${key}`)
    }
  }
  return patch
}

/**
 * Validates a C1 settings patch and merges it over the current settings.
 * `Partial<AppSettings>` is partial at the top level only — a provided
 * section must be complete, so each one is validated in full.
 */
export function mergeSettings(current: AppSettings, patch: unknown): AppSettings {
  if (!isPlainObject(patch)) throw new TypeError('settings patch must be an object')
  for (const key of Object.keys(patch)) {
    if (key !== 'ai' && key !== 'controlPlane') throw new TypeError(`Unknown settings key: ${key}`)
  }
  const next = structuredClone(current)

  if (patch['ai'] !== undefined) {
    const ai = patch['ai']
    if (!isPlainObject(ai) || !isPlainObject(ai['chat']) || !isPlainObject(ai['embeddings'])) {
      throw new TypeError('settings.ai must include mode, chat, and embeddings')
    }
    if (ai['mode'] !== 'local' && ai['mode'] !== 'gateway') {
      throw new TypeError("settings.ai.mode must be 'local' or 'gateway'")
    }
    next.ai = {
      mode: ai['mode'],
      chat: {
        provider: expectString(ai['chat']['provider'], 'settings.ai.chat.provider'),
        model: expectString(ai['chat']['model'], 'settings.ai.chat.model'),
      },
      embeddings: {
        provider: expectString(ai['embeddings']['provider'], 'settings.ai.embeddings.provider'),
        model: expectString(ai['embeddings']['model'], 'settings.ai.embeddings.model'),
      },
    }
  }

  if (patch['controlPlane'] !== undefined) {
    const cp = patch['controlPlane']
    if (!isPlainObject(cp)) throw new TypeError('settings.controlPlane must be an object')
    if (typeof cp['telemetryOptIn'] !== 'boolean') {
      throw new TypeError('settings.controlPlane.telemetryOptIn must be a boolean')
    }
    next.controlPlane = {
      baseUrl: expectString(cp['baseUrl'], 'settings.controlPlane.baseUrl'),
      telemetryOptIn: cp['telemetryOptIn'],
    }
  }

  return next
}

// ── Services ────────────────────────────────────────────────────────────

/** Case-insensitive on Windows, exact elsewhere — for path-set membership. */
function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

export function createChronicleServices(deps: ChronicleServicesDeps): ChronicleServices {
  const { db, libraryRoot, emit, secrets } = deps

  /** The tracked folder that owns a captured file (deepest matching root). */
  function owningFolder(filePath: string): TrackedFolder | undefined {
    const abs = path.resolve(filePath)
    let best: TrackedFolder | undefined
    for (const folder of listTrackedFolders(db)) {
      const rel = path.relative(folder.path, abs)
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue
      if (!best || folder.path.length > best.path.length) best = folder
    }
    return best
  }

  /**
   * Honors the per-folder tracking selection (C1 excludedPaths/allowedExtensions).
   * A file with no owning folder is captured (e.g. a restore write) — selection
   * only constrains files inside a tracked tree.
   */
  function selectedForCapture(filePath: string): boolean {
    const folder = owningFolder(filePath)
    if (!folder) return true
    const abs = path.resolve(filePath)
    if (folder.excludedPaths.some((p) => samePath(p, abs))) return false
    return folder.allowedExtensions.includes(path.extname(abs).toLowerCase())
  }

  // Watcher → capture → events (the wiring MVP-03/04 left open). Capture
  // results are handled asynchronously; nothing here blocks an IPC reply.
  const watcher: FolderWatcher = createFolderWatcher(
    {
      onAccepted: (candidate) => {
        // Per-folder selection (C1): silently ignore deselected files/types.
        if (!selectedForCapture(candidate.path)) return
        void captureVersion(db, libraryRoot, candidate.path)
          .then((result) => {
            if (result.outcome === 'captured') {
              emit('versionCaptured', {
                assetId: result.version.assetId,
                versionId: result.version.id,
              })
              pushStatus()
            }
          })
          .catch((error) => console.error('[chronicle] capture failed:', candidate.path, error))
      },
      onSkipped: (candidate, reason) => {
        // C4 rejects several ways, but only the size cap warrants a visible
        // notice (F3.6) — temp/hidden/unsupported files are silently ignored.
        if (reason === 'too-large') {
          emit('fileSkipped', { fileName: path.basename(candidate.path), reason })
        }
      },
      onRemoved: (filePath) => markFileMissing(db, filePath),
      onError: (error) => console.error('[chronicle] watcher error:', error),
    },
    { settleMs: deps.settleMs, emitInitial: deps.emitInitial },
  )

  /** Fire-and-forget status refresh after anything that changes AppStatus. */
  function pushStatus(): void {
    void api
      .getAppStatus()
      .then((status) => emit('statusChanged', status))
      .catch(() => {})
  }

  function summaryTextOf(version: VersionRecord): string | null {
    if (version.restoredFromVersion !== null) {
      return `Restored from version ${version.restoredFromVersion}`
    }
    return getAnnotation(db, version.id)?.summary ?? null
  }

  function toVersionSummary(version: VersionRecord): VersionSummary {
    return {
      id: version.id,
      assetId: version.assetId,
      versionNumber: version.versionNumber,
      capturedAt: version.capturedAt,
      aiStatus: version.aiStatus,
      summary: summaryTextOf(version),
      thumbnailUrl: imageUrlForHash(version.contentHash),
    }
  }

  const notImplemented = (feature: string) => async (): Promise<never> => {
    throw new Error(`${feature} is not implemented yet`)
  }

  const api: ChronicleApi = {
    // F2 — tracked folders
    async listFolders() {
      return listTrackedFolders(db)
    },

    async pickFolder() {
      return deps.pickFolder()
    },

    async scanFolder(folderPath) {
      const root = path.resolve(expectString(folderPath, 'folderPath'))
      const entries: FolderScanEntry[] = []
      const MAX_ENTRIES = 5_000 // safety cap for pathological trees

      const walk = async (dir: string): Promise<void> => {
        if (entries.length >= MAX_ENTRIES) return
        let dirents
        try {
          dirents = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          return // unreadable directory — skip rather than fail the whole scan
        }
        for (const dirent of dirents) {
          if (entries.length >= MAX_ENTRIES) return
          const full = path.join(dir, dirent.name)
          if (dirent.isDirectory()) {
            if (isHiddenPath(dirent.name)) continue
            await walk(full)
          } else if (dirent.isFile()) {
            if (isHiddenPath(dirent.name) || isTemporaryPath(full) || !hasWatchedExtension(full)) {
              continue
            }
            let sizeBytes = 0
            try {
              sizeBytes = (await fs.stat(full)).size
            } catch {
              continue
            }
            entries.push({
              path: full,
              relativePath: path.relative(root, full),
              sizeBytes,
              ext: path.extname(full).toLowerCase(),
            })
          }
        }
      }

      await walk(root)
      entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      return entries
    },

    async addFolder(folderPath, meta) {
      const resolved = path.resolve(expectString(folderPath, 'folderPath'))
      const validatedMeta = expectFolderMeta(meta, 'meta')
      // Idempotent by path: re-tracking a folder returns the existing row
      // (its presentation fields are left as they were).
      const existing = listTrackedFolders(db).find((f) => f.path === resolved)
      const folder = existing ?? addTrackedFolder(db, resolved, validatedMeta)
      watcher.watch(resolved) // no-op if already watched; initial scan captures existing files
      pushStatus()
      return folder
    },

    async updateFolder(folderId, patch) {
      const id = expectId(folderId, 'folderId')
      const validatedPatch = expectFolderMeta(patch, 'patch')
      const updated = updateTrackedFolder(db, id, validatedPatch)
      if (!updated) throw new Error(`Unknown folder: ${folderId}`)
      return updated
    },

    async removeFolder(folderId, mode) {
      const id = expectId(folderId, 'folderId')
      const validatedMode = expectProjectRemovalMode(mode)
      const folder = listTrackedFolders(db).find((f) => f.id === id)
      if (!folder) return // already gone — removing twice is not an error
      await watcher.unwatch(folder.path)
      try {
        if (validatedMode === 'delete-history') {
          const deleted = deleteProjectHistory(db, id)
          await Promise.all(
            deleted.orphanedContentHashes.map((hash) =>
              fs.rm(libraryFilePathFor(libraryRoot, hash), { force: true }).catch((error) => {
                // Metadata is already gone and the blob is unreferenced. An
                // undeletable orphan is safe to leave for later maintenance.
                console.warn('[chronicle] could not remove orphaned library blob:', hash, error)
              }),
            ),
          )
        } else {
          removeTrackedFolder(db, id)
        }
      } catch (error) {
        // Keep the in-memory watcher consistent if persistence failed.
        if (listTrackedFolders(db).some((item) => item.id === id)) watcher.watch(folder.path)
        throw error
      }
      pushStatus()
    },

    // F5 — assets, timeline, details
    async listAssets() {
      const summaries: AssetSummary[] = []
      for (const item of listAssets(db)) {
        const latest = getLatestVersion(db, item.id)
        if (!latest) continue // capture creates the first version moments later
        summaries.push({
          id: item.id,
          displayName: item.displayName,
          path: item.path,
          onDisk: item.onDisk,
          versionCount: item.versionCount,
          lastCapturedAt: item.lastCapturedAt ?? item.createdAt,
          lastSummary: item.lastSummary,
          thumbnailUrl: imageUrlForHash(latest.contentHash),
        })
      }
      return summaries
    },

    async getTimeline(assetId) {
      return listVersions(db, expectId(assetId, 'assetId')).map(toVersionSummary)
    },

    async getVersionDetails(versionId) {
      const version = getVersion(db, expectId(versionId, 'versionId'))
      if (!version) throw new Error(`Unknown version: ${versionId}`)
      const annotation = getAnnotation(db, version.id)
      const details: VersionDetails = {
        ...toVersionSummary(version),
        imageUrl: imageUrlForHash(version.contentHash),
        contentHash: version.contentHash,
        sizeBytes: version.sizeBytes,
        // C1 declares dimensions as numbers; 0 = "could not be parsed" (rare —
        // only for corrupt files that still hashed as PNG/JPG candidates).
        width: version.width ?? 0,
        height: version.height ?? 0,
        changes: annotation?.changes ?? [],
        tags: annotation?.tags ?? [],
        aiProvider: annotation?.provider ?? null,
        restoredFromVersion: version.restoredFromVersion,
      }
      return details
    },

    async resetAssetHistory(assetId) {
      const id = expectId(assetId, 'assetId')
      const result = resetStoredAssetHistory(db, id)
      emit('assetHistoryReset', { assetId: id, versionId: result.version.id })
      pushStatus()
      return { versionId: result.version.id }
    },

    // F6 — append-only restore + native save-copy fallback
    async restoreVersion(versionId) {
      const id = expectId(versionId, 'versionId')
      const result = await restoreStoredVersion(db, libraryRoot, id)
      if (result.outcome === 'folder-missing') return { ok: false, reason: 'folder-missing' }
      emit('versionCaptured', { assetId: result.version.assetId, versionId: result.version.id })
      pushStatus()
      return { ok: true, newVersionNumber: result.version.versionNumber }
    },

    async saveVersionCopy(versionId) {
      const id = expectId(versionId, 'versionId')
      const version = getVersion(db, id)
      if (!version) throw new Error(`Unknown version: ${versionId}`)
      const asset = getAsset(db, version.assetId)
      if (!asset) throw new Error(`Asset for version ${versionId} no longer exists`)
      const destination = await deps.pickVersionCopyPath(asset.displayName)
      if (destination === null) return
      await copyStoredVersion(db, libraryRoot, id, destination)
    },

    // F7 — search (MVP-10)
    search: notImplemented('Search (MVP-10)'),

    // F4 — AI retry: re-queue only; the result arrives as annotationUpdated
    // once the AI pipeline (MVP-09) processes the queue.
    async retryAnnotation(versionId) {
      const version = getVersion(db, expectId(versionId, 'versionId'))
      if (!version) throw new Error(`Unknown version: ${versionId}`)
      if (version.aiStatus === 'none') {
        throw new Error('This version is a restore marker and has no AI annotation')
      }
      const alreadyQueued = listJobs(db, 'ai_annotation').some(
        (job) => (job.payload as { versionId?: number } | null)?.versionId === version.id,
      )
      if (!alreadyQueued) enqueueJob(db, 'ai_annotation', { versionId: version.id })
      setVersionAiStatus(db, version.id, 'pending')
      emit('annotationUpdated', { versionId: version.id, aiStatus: 'pending' })
      pushStatus()
    },

    // C5 — settings (secrets live in SecretStore, never in this object)
    async getSettings() {
      const stored = getSetting<AppSettings>(db, SETTINGS_KEY)
      // Merging over the defaults keeps old stored settings valid when a
      // field is added; mergeSettings also re-validates what was stored.
      return stored ? mergeSettings(DEFAULT_SETTINGS, stored) : structuredClone(DEFAULT_SETTINGS)
    },

    async updateSettings(patch) {
      const next = mergeSettings(await api.getSettings(), patch)
      setSetting(db, SETTINGS_KEY, next)
      pushStatus() // ai provider/model changes flip aiConfigured
      return next
    },

    async setApiKey(provider, key) {
      const providerId = expectString(provider, 'provider')
      if (providerId.trim() === '') throw new TypeError('provider must not be empty')
      const plaintext = expectString(key, 'key')
      if (plaintext.trim() === '') throw new TypeError('key must not be empty')
      await secrets.set(providerId, plaintext)
      pushStatus()
    },

    async clearApiKey(provider) {
      await secrets.clear(expectString(provider, 'provider'))
      pushStatus()
    },

    async configuredProviders() {
      return secrets.providers()
    },

    // F1 — account (low priority; the app is fully usable in local mode)
    async getAccountState() {
      return { mode: 'local', email: null, isAdmin: false }
    },
    register: notImplemented('Accounts (F1)'),
    login: notImplemented('Accounts (F1)'),
    async logout() {
      // Local mode has no session — logging out is trivially done.
    },

    // Status bar
    async getAppStatus() {
      const jobs = listJobs(db)
      const count = (type: JobType): number => jobs.filter((j) => j.jobType === type).length
      const settings = await api.getSettings()
      const status: AppStatus = {
        watchedFolders: watcher.watched().length,
        online: deps.isOnline(),
        pendingJobs: {
          ai: count('ai_annotation'),
          embedding: count('embedding'),
          telemetry: count('telemetry'),
        },
        // Ready when the annotation (chat) provider is fully configured AND has
        // a saved key. Per-task keys mean readiness is provider-specific.
        aiConfigured:
          settings.ai.chat.provider !== '' &&
          settings.ai.chat.model !== '' &&
          (await secrets.has(settings.ai.chat.provider)),
      }
      return status
    },

    async listPendingJobs() {
      const pending: PendingJob[] = []
      for (const job of listJobs(db)) {
        if (job.jobType !== 'ai_annotation' && job.jobType !== 'embedding') continue

        const payload = isPlainObject(job.payload) ? job.payload : undefined
        const candidateVersionId = payload?.['versionId']
        const versionId =
          typeof candidateVersionId === 'number' && Number.isInteger(candidateVersionId) && candidateVersionId > 0
            ? candidateVersionId
            : null
        const version = versionId === null ? undefined : getVersion(db, versionId)
        const asset = version ? getAsset(db, version.assetId) : undefined
        pending.push({
          id: job.id,
          jobType: job.jobType,
          queuedAt: job.createdAt,
          retryCount: job.retryCount,
          versionId,
          assetId: version?.assetId ?? null,
          assetName: asset?.displayName ?? null,
          versionNumber: version?.versionNumber ?? null,
          thumbnailUrl: version ? imageUrlForHash(version.contentHash) : null,
        })
      }
      return pending
    },
  }

  return {
    api,
    start(): void {
      for (const folder of listTrackedFolders(db)) watcher.watch(folder.path)
    },
    dispose(): Promise<void> {
      return watcher.close()
    },
  }
}
