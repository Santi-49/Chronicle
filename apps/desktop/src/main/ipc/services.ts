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
 * Search and account/control-plane operations are optional and injected;
 * local mode always works without either external service.
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { TelemetryCollector } from '../telemetry/emitter'
import type {
  AppStatus,
  ApplicationDiagnostic,
  AssetSummary,
  ChronicleApi,
  WindowTheme,
  FolderMetaPatch,
  FolderScanEntry,
  ControlPlaneDiagnostic,
  PendingControlPlaneEvent,
  PendingJob,
  RendererErrorReport,
  TrackedFolder,
  VersionDetails,
  VersionSummary,
} from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import { aiSelectionError } from '../../shared/aiCatalog'
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
  enqueueEmbeddingReindexJobs,
  retryAllFailedAiJobs,
  retryJob,
  getFolderTelemetryId,
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
import type { ControlPlaneClient, InstallationDescriptor } from '../gateway-client/client'
import { portableSettings, sanitizeControlPlaneData } from '../gateway-client/client'
import { decryptProviderKeys, encryptProviderKeys } from '../gateway-client/secret-envelope'
import { embeddingModelIdentity, search } from '../search'
import type { AiClient } from '../ai/client'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'

// ── Settings defaults (implementation policy per C5, not contract) ──────

const SETTINGS_KEY = 'app-settings'
const INSTALLATION_ID_KEY = 'control-plane-installation-id'
const TELEMETRY_DEFAULT_MIGRATION_KEY = 'post03-telemetry-default-applied'
const SETTINGS_SYNC_DEFAULT_MIGRATION_KEY = 'post03-settings-sync-default-applied'
const TELEMETRY_NOTICE_SHOWN_KEY = 'post04-telemetry-notice-shown'

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: { theme: 'system' },
  ai: {
    mode: 'local',
    // Default demo provider/model (Google Gemini) — validated in RESEARCH.md's
    // live acceptance. This is configuration, not code: the engine stays
    // model-agnostic (spec §6.4) and the user can switch provider/model in
    // Settings. AI stays inert until an API key is also configured.
    chat: { provider: 'google_genai', model: 'gemini-flash-latest' },
    embeddings: { provider: 'google_genai', model: 'gemini-embedding-001' },
  },
  controlPlane: {
    baseUrl: 'http://localhost:8000',
    telemetryOptIn: true,
    settingsSyncEnabled: true,
    apiKeySyncEnabled: false,
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
  account?: ControlPlaneClient
  googleCredential?: () => Promise<string>
  googleClientConfigured?: boolean
  /** Initial API origin for a profile that has not persisted control-plane settings yet. */
  controlPlaneBaseUrl?: string
  /** Authoritative development endpoint loaded from the repository .env. */
  controlPlaneBaseUrlOverride?: string
  /** Sanitized in-memory request history owned by the Electron wiring layer. */
  controlPlaneDiagnostics?: () => ControlPlaneDiagnostic[]
  clearControlPlaneDiagnostics?: () => void
  /** Structured lifecycle/error log owned by the Electron wiring layer. */
  applicationDiagnostics?: () => ApplicationDiagnostic[]
  diagnostic?: ApplicationDiagnosticSink
  rendererDiagnostic?: ApplicationDiagnosticSink
  preloadDiagnostic?: ApplicationDiagnosticSink
  installation?: Omit<InstallationDescriptor, 'installationId'>
  /** Applies theme colors to native title-bar controls. */
  setWindowTheme: (theme: WindowTheme) => void
  /**
    * MVP-10 — AI client for embedding the search query.
   * Optional: when absent (e.g. in tests), search degrades to keyword-only.
   */
  aiClient?: AiClient
  /** Decrypts the stored API key for the given provider. Injected by register.ts. */
  readApiKey?: (provider: string) => string | null
  /** Callback fired when the user turns telemetry off — worker clears queue + server inventory. */
  onTelemetryDisabled?: () => Promise<void>
  telemetry?: TelemetryCollector
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

function expectRendererErrorReport(value: unknown): RendererErrorReport {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('renderer error report must be an object')
  }
  const report = value as Record<string, unknown>
  const allowed = new Set(['source', 'kind', 'message', 'name', 'stack', 'occurredAt'])
  if (Object.keys(report).some((key) => !allowed.has(key))) {
    throw new TypeError('renderer error report contains an unknown field')
  }
  if (report['kind'] !== 'error' && report['kind'] !== 'unhandledrejection') {
    throw new TypeError('renderer error report kind is invalid')
  }
  if (report['source'] !== 'renderer' && report['source'] !== 'preload') {
    throw new TypeError('renderer error report source is invalid')
  }
  for (const key of ['message', 'occurredAt']) {
    if (typeof report[key] !== 'string' || report[key].length === 0) {
      throw new TypeError(`renderer error report ${key} must be a non-empty string`)
    }
  }
  for (const key of ['name', 'stack']) {
    if (report[key] !== undefined && typeof report[key] !== 'string') {
      throw new TypeError(`renderer error report ${key} must be a string`)
    }
  }
  const message = report['message'] as string
  const occurredAt = report['occurredAt'] as string
  return {
    source: report['source'],
    kind: report['kind'],
    message: message.slice(0, 2_000),
    occurredAt,
    ...(typeof report['name'] === 'string' ? { name: report['name'].slice(0, 100) } : {}),
    ...(typeof report['stack'] === 'string' ? { stack: report['stack'].slice(0, 8_000) } : {}),
  }
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
    if (key !== 'appearance' && key !== 'ai' && key !== 'controlPlane') {
      throw new TypeError(`Unknown settings key: ${key}`)
    }
  }
  const next = structuredClone(current)

  if (patch['appearance'] !== undefined) {
    const appearance = patch['appearance']
    if (!isPlainObject(appearance) ||
      (appearance['theme'] !== 'system' && appearance['theme'] !== 'dark' && appearance['theme'] !== 'light')) {
      throw new TypeError("settings.appearance.theme must be 'system', 'dark', or 'light'")
    }
    next.appearance = { theme: appearance['theme'] }
  }

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
    if (cp['settingsSyncEnabled'] !== undefined && typeof cp['settingsSyncEnabled'] !== 'boolean') {
      throw new TypeError('settings.controlPlane.settingsSyncEnabled must be a boolean')
    }
    if (cp['apiKeySyncEnabled'] !== undefined && typeof cp['apiKeySyncEnabled'] !== 'boolean') {
      throw new TypeError('settings.controlPlane.apiKeySyncEnabled must be a boolean')
    }
    next.controlPlane = {
      baseUrl: expectString(cp['baseUrl'], 'settings.controlPlane.baseUrl'),
      telemetryOptIn: cp['telemetryOptIn'],
      settingsSyncEnabled:
        cp['settingsSyncEnabled'] === undefined
          ? current.controlPlane.settingsSyncEnabled
          : cp['settingsSyncEnabled'],
      apiKeySyncEnabled:
        cp['apiKeySyncEnabled'] === undefined
          ? current.controlPlane.apiKeySyncEnabled
          : cp['apiKeySyncEnabled'],
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
  const diagnostic: ApplicationDiagnosticSink = deps.diagnostic ?? (() => {})

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
        const captureStart = Date.now()
        void captureVersion(db, libraryRoot, candidate.path)
          .then((result) => {
            if (result.outcome === 'captured') {
              diagnostic({
                level: 'debug',
                source: 'capture',
                event: 'version_captured',
                message: `Captured ${path.basename(candidate.path)} as version ${result.version.versionNumber}.`,
                context: {
                  assetId: result.version.assetId,
                  versionId: result.version.id,
                  versionNumber: result.version.versionNumber,
                  fileName: path.basename(candidate.path),
                  sizeBytes: result.version.sizeBytes,
                  captureMs: Date.now() - captureStart,
                },
              })
              emit('versionCaptured', {
                assetId: result.version.assetId,
                versionId: result.version.id,
              })
              pushStatus()
            } else {
              diagnostic({
                level: 'debug',
                source: 'capture',
                event: 'version_unchanged',
                message: `Ignored unchanged file ${path.basename(candidate.path)}.`,
                context: { fileName: path.basename(candidate.path) },
              })
            }
          })
          .catch((error) => {
            diagnostic({
              level: 'error',
              source: 'capture',
              event: 'version_capture_failed',
              message: `Failed to capture ${path.basename(candidate.path)}.`,
              context: { fileName: path.basename(candidate.path), error: diagnosticError(error) },
            })
            console.error('[chronicle] capture failed:', candidate.path, error)
          })
      },
      onSkipped: (candidate, reason) => {
        // C4 rejects several ways, but only the size cap warrants a visible
        // notice (F3.6) — temp/hidden/unsupported files are silently ignored.
        if (reason === 'too-large') {
          diagnostic({
            level: 'warn',
            source: 'watcher',
            event: 'file_skipped',
            message: `Skipped ${path.basename(candidate.path)} because it is too large.`,
            context: { fileName: path.basename(candidate.path), reason },
          })
          emit('fileSkipped', { fileName: path.basename(candidate.path), reason })
        }
      },
      onRemoved: (filePath) => {
        markFileMissing(db, filePath)
        diagnostic({
          level: 'debug',
          source: 'watcher',
          event: 'file_removed',
          message: `Marked ${path.basename(filePath)} as missing.`,
          context: { fileName: path.basename(filePath) },
        })
      },
      onError: (error) => {
        const code = (error as NodeJS.ErrnoException).code
        const lockedFile = code === 'EBUSY'
        diagnostic({
          level: lockedFile ? 'warn' : 'error',
          source: 'watcher',
          event: lockedFile ? 'watcher_file_locked' : 'watcher_failed',
          message: lockedFile
            ? 'Windows temporarily locked a file while Chronicle was attaching its watcher; the rest of the folder remains watched.'
            : 'The folder watcher reported an error.',
          context: { code: code ?? null, error: diagnosticError(error) },
        })
        console.error('[chronicle] watcher error:', error)
      },
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

  /**
   * Persistent random telemetry ID for a folder, or undefined if the folder
   * row vanished (defensive — callers look it up moments before). Keeps the
   * POST-04 enqueue sites to a single readable expression.
   */
  function telemetryIdFor(folderId: number): string | undefined {
    try {
      return getFolderTelemetryId(db, folderId)
    } catch {
      return undefined
    }
  }

  function installationId(): string {
    const existing = getSetting<string>(db, INSTALLATION_ID_KEY)
    if (existing) return existing
    const created = randomUUID()
    setSetting(db, INSTALLATION_ID_KEY, created)
    return created
  }

  function requireAccount(): ControlPlaneClient {
    if (!deps.account) throw new Error('The Chronicle control plane is not configured')
    return deps.account
  }

  async function pushPortableSettings(local: AppSettings): Promise<void> {
    const account = requireAccount()
    const remote = await account.getSettings()
    await account.putSettings(portableSettings(local), remote.revision)
  }

  async function applyRemoteSettings(): Promise<void> {
    if (!deps.account) return
    const remote = await deps.account.getSettings()
    if (!remote.settings.settings_sync_enabled) return
    const local = await api.getSettings()
    const next = mergeSettings(local, {
      appearance: remote.settings.appearance,
      ai: remote.settings.ai,
      controlPlane: {
        baseUrl: local.controlPlane.baseUrl,
        telemetryOptIn: remote.settings.telemetry.enabled,
        settingsSyncEnabled: remote.settings.settings_sync_enabled,
        apiKeySyncEnabled: remote.settings.api_key_sync_enabled,
      },
    })
    setSetting(db, SETTINGS_KEY, next)
  }

  async function afterSignIn(): Promise<void> {
    if (!deps.account) return
    void deps.account.linkInstallation(installationId()).catch(() => {})
    await applyRemoteSettings()
  }

  function summaryTextOf(version: VersionRecord): string | null {
    if (version.restoredFromVersion !== null) {
      return `Restored from version ${version.restoredFromVersion}`
    }
    return getAnnotation(db, version.id)?.summary ?? null
  }

  function aiFailureOf(versionId: number) {
    const job = listJobs(db, 'ai_annotation').find((candidate) => {
      if (candidate.status !== 'failed') return false
      const payload = isPlainObject(candidate.payload) ? candidate.payload : undefined
      return payload?.['versionId'] === versionId
    })
    return job?.lastError ?? null
  }

  function toVersionSummary(version: VersionRecord): VersionSummary {
    return {
      id: version.id,
      assetId: version.assetId,
      versionNumber: version.versionNumber,
      capturedAt: version.capturedAt,
      aiStatus: version.aiStatus,
      aiFailure: version.aiStatus === 'failed' ? aiFailureOf(version.id) : null,
      summary: summaryTextOf(version),
      thumbnailUrl: imageUrlForHash(version.contentHash),
    }
  }

  async function testAiSelection(
    task: 'chat' | 'embeddings',
    provider: string,
    model: string,
  ) {
    const selectionError = aiSelectionError(task, provider, model, true)
    if (selectionError) throw new TypeError(selectionError)
    const apiKey = deps.readApiKey?.(provider)
    if (!apiKey) throw new Error(`Save an API key for ${provider} before testing this connection.`)
    if (!deps.aiClient) throw new Error('The local AI validation service is unavailable.')
    try {
      return await deps.aiClient.validateProviderModel({ task, provider, model, apiKey })
    } catch {
      throw new Error('The local AI validation service could not be reached.')
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

    async reportRendererError(value) {
      const report = expectRendererErrorReport(value)
      const draft = {
        timestamp: report.occurredAt,
        level: 'error' as const,
        source: 'application' as const,
        event: report.kind === 'error' ? 'renderer_error' : 'renderer_unhandled_rejection',
        message: 'The renderer encountered an unexpected error.',
        context: {
          operation: 'renderer_runtime',
          error: {
            name: report.name ?? 'Error',
            message: report.message,
            stack: report.stack ?? null,
          },
        },
      }
      const sink = report.source === 'preload' ? deps.preloadDiagnostic : deps.rendererDiagnostic
      ;(sink ?? diagnostic)(draft)
    },

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
      const existing = listTrackedFolders(db).find((f) => f.path === resolved)
      const folder = existing ?? addTrackedFolder(db, resolved, validatedMeta)
      watcher.watch(resolved)
      pushStatus()
      // POST-04: only enqueue for genuinely new projects, not re-tracks.
      if (!existing) {
        diagnostic({
          level: 'debug',
          source: 'project',
          event: 'project_created',
          message: `Created project ${folder.displayName}.`,
          context: {
            projectId: folder.id,
            displayName: folder.displayName,
            allowedExtensions: folder.allowedExtensions,
            excludedFileCount: folder.excludedPaths.length,
          },
        })
      }
      return folder
    },

    async updateFolder(folderId, patch) {
      const id = expectId(folderId, 'folderId')
      const validatedPatch = expectFolderMeta(patch, 'patch')
      const updated = updateTrackedFolder(db, id, validatedPatch)
      if (!updated) throw new Error(`Unknown folder: ${folderId}`)
      diagnostic({
        level: 'debug',
        source: 'project',
        event: 'project_updated',
        message: `Updated project ${updated.displayName}.`,
        context: { projectId: id, changedFields: Object.keys(validatedPatch) },
      })
      return updated
    },

    async removeFolder(folderId, mode) {
      const id = expectId(folderId, 'folderId')
      const validatedMode = expectProjectRemovalMode(mode)
      const folder = listTrackedFolders(db).find((f) => f.id === id)
      if (!folder) return
      // Capture telemetry ID before the row is deleted.
      const telemetryId = telemetryIdFor(id)
      await watcher.unwatch(folder.path)
      try {
        if (validatedMode === 'delete-history') {
          const deleted = deleteProjectHistory(db, id)
          await Promise.all(
            deleted.orphanedContentHashes.map((hash) =>
              fs.rm(libraryFilePathFor(libraryRoot, hash), { force: true }).catch((error) => {
                console.warn('[chronicle] could not remove orphaned library blob:', hash, error)
              }),
            ),
          )
        } else {
          removeTrackedFolder(db, id)
        }
      } catch (error) {
        if (listTrackedFolders(db).some((item) => item.id === id)) watcher.watch(folder.path)
        throw error
      }
      pushStatus()
      diagnostic({
        level: 'debug',
        source: 'project',
        event: 'project_removed',
        message: `Removed project ${folder.displayName}.`,
        context: { projectId: id, mode: validatedMode },
      })
      if (telemetryId) {
        deps.telemetry?.recordProjectRemoved(telemetryId, validatedMode === 'delete-history')
      }
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
      diagnostic({
        level: 'debug',
        source: 'capture',
        event: 'version_history_reset',
        message: `Reset asset ${id} history to version 1.`,
        context: { assetId: id, versionId: result.version.id },
      })
      return { versionId: result.version.id }
    },

    // F6 — append-only restore + native save-copy fallback
    async restoreVersion(versionId) {
      const id = expectId(versionId, 'versionId')
      const version = getVersion(db, id)
      const result = await restoreStoredVersion(db, libraryRoot, id)
      if (result.outcome === 'folder-missing') {
        diagnostic({
          level: 'warn',
          source: 'capture',
          event: 'version_restore_failed',
          message: `Could not restore version ${id} because its folder is missing.`,
          context: { versionId: id, reason: 'folder-missing' },
        })
        return { ok: false, reason: 'folder-missing' }
      }
      emit('versionCaptured', { assetId: result.version.assetId, versionId: result.version.id })
      pushStatus()
      diagnostic({
        level: 'debug',
        source: 'capture',
        event: 'version_restored',
        message: `Restored version ${id} as version ${result.version.versionNumber}.`,
        context: {
          restoredFromVersionId: id,
          versionId: result.version.id,
          assetId: result.version.assetId,
          versionNumber: result.version.versionNumber,
        },
      })
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

    // F7 — hybrid search (MVP-10)
    async search(query) {
      const q = expectString(query, 'query')
      const settings = await api.getSettings()
      const embeddingsModel = settings.ai.embeddings.model
      const provider = settings.ai.embeddings.provider

      let embedQuery: ((text: string) => Promise<number[]>) | null = null
      if (deps.aiClient && deps.readApiKey && embeddingsModel !== '' && provider !== '') {
        const apiKey = deps.readApiKey(provider)
        if (apiKey !== null) {
          const client = deps.aiClient
          embedQuery = async (text: string) => {
            const response = await client.embedText({ provider, model: embeddingsModel, apiKey, text })
            return response.embedding
          }
        }
      }

      const searchStart = Date.now()
      const results = await search(q, {
        db,
        embedQuery,
        embeddingsModel: embeddingModelIdentity(provider, embeddingsModel),
      })
      deps.telemetry?.recordSearch()
      return results
    },

    // F4 — AI retry: re-queue only; the result arrives as annotationUpdated
    // once the AI pipeline (MVP-09) processes the queue.
    async retryAnnotation(versionId) {
      const version = getVersion(db, expectId(versionId, 'versionId'))
      if (!version) throw new Error(`Unknown version: ${versionId}`)
      if (version.aiStatus === 'none') {
        throw new Error('This version is a restore marker and has no AI annotation')
      }
      const alreadyQueued = listJobs(db, 'ai_annotation').find(
        (job) => (job.payload as { versionId?: number } | null)?.versionId === version.id,
      )
      if (!alreadyQueued) enqueueJob(db, 'ai_annotation', { versionId: version.id })
      else if (alreadyQueued.status === 'failed') retryJob(db, alreadyQueued.id)
      setVersionAiStatus(db, version.id, 'pending')
      emit('annotationUpdated', { versionId: version.id, aiStatus: 'pending' })
      pushStatus()
    },

    async retryAllFailedJobs() {
      const failed = retryAllFailedAiJobs(db)
      for (const job of failed) {
        if (job.jobType !== 'ai_annotation') continue
        const payload = isPlainObject(job.payload) ? job.payload : undefined
        const versionId = payload?.['versionId']
        if (typeof versionId !== 'number') continue
        setVersionAiStatus(db, versionId, 'pending')
        emit('annotationUpdated', { versionId, aiStatus: 'pending' })
      }
      if (failed.length > 0) {
        diagnostic({
          level: 'info',
          source: 'ai',
          event: 'failed_jobs_requeued',
          message: `Requeued ${failed.length} failed AI job${failed.length === 1 ? '' : 's'} at the user's request.`,
          context: { jobIds: failed.map((job) => job.id) },
        })
      }
      pushStatus()
      return failed.length
    },

    // C5 — settings (secrets live in SecretStore, never in this object)
    async getSettings() {
      const stored = getSetting<unknown>(db, SETTINGS_KEY)
      // Merging over the defaults keeps old stored settings valid when a
      // field is added; mergeSettings also re-validates what was stored.
      const migratedPatch = stored === undefined ? {} : structuredClone(stored)
      if (!isPlainObject(migratedPatch)) return mergeSettings(DEFAULT_SETTINGS, migratedPatch)
      let needsMigration = false
      const storedAi = migratedPatch['ai']
      if (isPlainObject(storedAi)) {
        for (const task of ['chat', 'embeddings']) {
          const selected = storedAi[task]
          if (isPlainObject(selected) && selected['provider'] === 'google') {
            selected['provider'] = 'google_genai'
            needsMigration = true
          }
        }
      }
      const settings = mergeSettings(DEFAULT_SETTINGS, migratedPatch)
      if (deps.controlPlaneBaseUrlOverride) {
        if (settings.controlPlane.baseUrl !== deps.controlPlaneBaseUrlOverride) {
          settings.controlPlane.baseUrl = deps.controlPlaneBaseUrlOverride
          needsMigration = true
        }
      } else if (
        deps.controlPlaneBaseUrl &&
        (stored === undefined || settings.controlPlane.baseUrl === DEFAULT_SETTINGS.controlPlane.baseUrl)
      ) {
        settings.controlPlane.baseUrl = deps.controlPlaneBaseUrl
        needsMigration = true
      }
      // These fields existed as false, non-user-facing placeholders before POST-03.
      // Migrate each once, then preserve every explicit opt-out.
      if (!getSetting<boolean>(db, TELEMETRY_DEFAULT_MIGRATION_KEY)) {
        settings.controlPlane.telemetryOptIn = true
        setSetting(db, TELEMETRY_DEFAULT_MIGRATION_KEY, true)
        needsMigration = true
      }
      if (!getSetting<boolean>(db, SETTINGS_SYNC_DEFAULT_MIGRATION_KEY)) {
        settings.controlPlane.settingsSyncEnabled = true
        setSetting(db, SETTINGS_SYNC_DEFAULT_MIGRATION_KEY, true)
        needsMigration = true
      }
      if (needsMigration) setSetting(db, SETTINGS_KEY, settings)
      return settings
    },

    async updateSettings(patch) {
      const current = await api.getSettings()
      const next = mergeSettings(current, patch)
      const changedTasks = (['chat', 'embeddings'] as const).filter(
        (task) =>
          current.ai[task].provider !== next.ai[task].provider ||
          current.ai[task].model !== next.ai[task].model,
      )
      await Promise.all(
        changedTasks.map(async (task) => {
          const selected = next.ai[task]
          // Empty provider+model explicitly disables a task.
          if (!selected.provider && !selected.model) return
          const result = await testAiSelection(task, selected.provider, selected.model)
          if (!result.valid) throw new TypeError(result.message)
        }),
      )
      setSetting(db, SETTINGS_KEY, next)
      const embeddingsChanged =
        current.ai.embeddings.provider !== next.ai.embeddings.provider ||
        current.ai.embeddings.model !== next.ai.embeddings.model
      if (embeddingsChanged && next.ai.embeddings.provider && next.ai.embeddings.model) {
        enqueueEmbeddingReindexJobs(db)
      }
      pushStatus() // ai provider/model changes flip aiConfigured
      if (next.controlPlane.settingsSyncEnabled && deps.account) {
        void pushPortableSettings(next).catch(() => {})
      }
      // POST-04: if telemetry was just turned off, clear the queue + server inventory.
      const wasOn = current.controlPlane.telemetryOptIn
      const isOff = !next.controlPlane.telemetryOptIn
      if (wasOn && isOff) {
        await deps.onTelemetryDisabled?.()
      }
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
    async testAiConfiguration(task, provider, model) {
      if (task !== 'chat' && task !== 'embeddings') {
        throw new TypeError("task must be 'chat' or 'embeddings'")
      }
      return testAiSelection(
        task,
        expectString(provider, 'provider').trim(),
        expectString(model, 'model').trim(),
      )
    },

    // F1 — account (the app is fully usable in local mode)
    async checkControlPlaneHealth() {
      if (!deps.account || !deps.googleClientConfigured) return false
      return deps.account.health()
    },
    async probeControlPlaneHealth() {
      return deps.account?.health() ?? false
    },
    async listControlPlaneDiagnostics() {
      return deps.controlPlaneDiagnostics?.() ?? []
    },
    async clearControlPlaneDiagnostics() {
      deps.clearControlPlaneDiagnostics?.()
    },
    async listApplicationDiagnostics() {
      return deps.applicationDiagnostics?.() ?? []
    },
    async listPendingControlPlaneEvents() {
      const count = deps.telemetry?.pendingCount() ?? 0
      const legacy = listJobs(db, 'telemetry').map((job): PendingControlPlaneEvent => ({
        id: job.id,
        queuedAt: job.createdAt,
        retryCount: job.retryCount,
        payload: sanitizeControlPlaneData(job.payload),
      }))
      return count === 0 ? legacy : [...legacy, {
        id: 1,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
        payload: sanitizeControlPlaneData({ pendingUsageStatisticRecords: count }),
      } satisfies PendingControlPlaneEvent]
    },
    async getAccountState() {
      return deps.account?.accountState() ?? { mode: 'local', email: null, isAdmin: false }
    },
    async register(email, password) {
      const state = await requireAccount().register(
        expectString(email, 'email'), expectString(password, 'password'),
      )
      await afterSignIn()
      return state
    },
    async login(email, password) {
      const state = await requireAccount().login(
        expectString(email, 'email'), expectString(password, 'password'),
      )
      await afterSignIn()
      return state
    },
    async loginWithGoogle() {
      if (!deps.googleCredential) throw new Error('Google sign-in is not configured')
      if (!(await api.checkControlPlaneHealth())) {
        throw new Error('Google sign-in is temporarily unavailable')
      }
      const account = requireAccount()
      const credential = await deps.googleCredential()
      const current = await account.accountState()
      const state = current.mode === 'signed-in'
        ? await account.linkGoogleCredential(credential)
        : await account.loginWithGoogleCredential(credential)
      await afterSignIn()
      return state
    },
    async logout() {
      await deps.account?.logout()
    },
    async syncSettings() {
      const local = await api.getSettings()
      const enabled = mergeSettings(local, {
        controlPlane: { ...local.controlPlane, settingsSyncEnabled: true },
      })
      setSetting(db, SETTINGS_KEY, enabled)
      await pushPortableSettings(enabled)
    },
    async syncApiKeys(passphrase) {
      const phrase = expectString(passphrase, 'passphrase')
      const entries = await secrets.entries()
      if (Object.keys(entries).length === 0) throw new Error('No provider API keys are saved')
      const account = requireAccount()
      const current = await account.getEncryptedSecret()
      await account.putEncryptedSecret(await encryptProviderKeys(entries, phrase), current?.revision ?? 0)
      const local = await api.getSettings()
      const enabled = mergeSettings(local, {
        controlPlane: { ...local.controlPlane, apiKeySyncEnabled: true },
      })
      setSetting(db, SETTINGS_KEY, enabled)
      if (enabled.controlPlane.settingsSyncEnabled) await pushPortableSettings(enabled)
    },
    async restoreApiKeys(passphrase) {
      const account = requireAccount()
      const synced = await account.getEncryptedSecret()
      if (!synced) throw new Error('No synced API keys were found')
      const entries = await decryptProviderKeys(synced.envelope, expectString(passphrase, 'passphrase'))
      for (const [provider, key] of Object.entries(entries)) await secrets.set(provider, key)
      const local = await api.getSettings()
      const enabled = mergeSettings(local, {
        controlPlane: { ...local.controlPlane, apiKeySyncEnabled: true },
      })
      setSetting(db, SETTINGS_KEY, enabled)
      pushStatus()
    },
    async disableApiKeySync() {
      await requireAccount().deleteEncryptedSecret()
      const local = await api.getSettings()
      const disabled = mergeSettings(local, {
        controlPlane: { ...local.controlPlane, apiKeySyncEnabled: false },
      })
      setSetting(db, SETTINGS_KEY, disabled)
      if (disabled.controlPlane.settingsSyncEnabled) await pushPortableSettings(disabled)
    },

    // Status bar
    async getAppStatus() {
      const jobs = listJobs(db)
      const count = (type: JobType): number =>
        jobs.filter((job) => job.jobType === type && job.status === 'pending').length
      const failedJobs = jobs.filter(
        (job) =>
          job.status === 'failed' &&
          (job.jobType === 'ai_annotation' || job.jobType === 'embedding'),
      ).length
      const settings = await api.getSettings()
      const status: AppStatus = {
        watchedFolders: watcher.watched().length,
        online: deps.isOnline(),
        pendingJobs: {
          ai: count('ai_annotation'),
          embedding: count('embedding'),
          telemetry: count('telemetry') + (deps.telemetry?.pendingCount() ?? 0),
        },
        failedJobs,
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
          state: job.status,
          lastError: job.lastError,
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
      if (deps.account && deps.installation) {
        void deps.account.registerInstallation({
          ...deps.installation,
          installationId: installationId(),
        }).catch(() => {})
      }
      deps.telemetry?.recordAppOpened()
    },
    dispose(): Promise<void> {
      return watcher.close()
    },
  }
}
