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
 * apps/desktop/README.md): restore/save-copy (MVP-07), search (MVP-10),
 * register/login (F1 — low priority; local mode always works).
 */
import path from 'node:path'
import type {
  AppStatus,
  AssetSummary,
  ChronicleApi,
  WindowTheme,
  VersionDetails,
  VersionSummary,
} from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import type { ChronicleDb } from '../db/database'
import {
  addTrackedFolder,
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
  removeTrackedFolder,
  enqueueJob,
  type JobType,
  type VersionRecord,
} from '../db/repositories'
import { createFolderWatcher, type FolderWatcher } from '../watcher/watcher'
import { captureVersion, markFileMissing } from '../versioning'
import type { EmitEvent } from './channels'
import { imageUrlForHash } from './media'
import type { SecretStore } from './secrets'

// ── Settings defaults (implementation policy per C5, not contract) ──────

const SETTINGS_KEY = 'app-settings'

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    mode: 'local',
    // Empty provider/model = "not configured yet" — the Settings screen fills
    // these in; the demo provider decision is tracked in docs/spec.md §7.
    chat: { provider: '', model: '' },
    embeddings: { provider: '', model: '' },
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
  secrets: SecretStore
  isOnline: () => boolean
  /** Applies theme colors to native title-bar controls. */
  setWindowTheme: (theme: WindowTheme) => void
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

export function createChronicleServices(deps: ChronicleServicesDeps): ChronicleServices {
  const { db, libraryRoot, emit, secrets } = deps

  // Watcher → capture → events (the wiring MVP-03/04 left open). Capture
  // results are handled asynchronously; nothing here blocks an IPC reply.
  const watcher: FolderWatcher = createFolderWatcher(
    {
      onAccepted: (candidate) => {
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
    async setWindowTheme(theme) {
      if (theme !== 'light' && theme !== 'dark') {
        throw new TypeError("theme must be 'light' or 'dark'")
      }
      deps.setWindowTheme(theme)
    },

    // F2 — tracked folders
    async listFolders() {
      return listTrackedFolders(db)
    },

    async addFolder() {
      const chosen = await deps.pickFolder()
      if (chosen === null) return null
      const folderPath = path.resolve(chosen)
      const existing = listTrackedFolders(db).find((f) => f.path === folderPath)
      const folder = existing ?? addTrackedFolder(db, folderPath)
      watcher.watch(folderPath) // no-op if already watched; initial scan captures existing files
      pushStatus()
      return folder
    },

    async removeFolder(folderId) {
      const id = expectId(folderId, 'folderId')
      const folder = listTrackedFolders(db).find((f) => f.id === id)
      if (!folder) return // already gone — removing twice is not an error
      removeTrackedFolder(db, id)
      await watcher.unwatch(folder.path)
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

    // F6 — restore (MVP-07)
    restoreVersion: notImplemented('Restore (MVP-07)'),
    saveVersionCopy: notImplemented('Save a copy (MVP-07)'),

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

    async setApiKey(key) {
      const plaintext = expectString(key, 'key')
      if (plaintext.trim() === '') throw new TypeError('key must not be empty')
      await secrets.set(plaintext)
      pushStatus()
    },

    async hasApiKey() {
      return secrets.has()
    },

    async clearApiKey() {
      await secrets.clear()
      pushStatus()
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
        aiConfigured:
          (await secrets.has()) &&
          settings.ai.chat.provider !== '' &&
          settings.ai.chat.model !== '',
      }
      return status
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
