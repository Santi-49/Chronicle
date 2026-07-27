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
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { TelemetryCollector } from '../telemetry/emitter'
import type {
  AiStatus,
  ActivityDashboardQuery,
  AppStatus,
  ApplicationDiagnostic,
  AssetSummary,
  ChronicleApi,
  WindowTheme,
  FolderMetaPatch,
  FolderScanEntry,
  ControlPlaneDiagnostic,
  DeleteAssetHistoryResult,
  PendingJob,
  RendererErrorReport,
  SystemIntegrationState,
  TrackedFolder,
  UpdateState,
  VersionDetails,
  VersionSummary,
} from '../../shared/ipc'
import { REMOVED_ASSET_RETENTION_DAYS } from '../../shared/ipc'
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
  deleteAssetsPermanently,
  deleteProjectHistory,
  listExpiredMissingAssetIds,
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
import { imageUrlForHash, thumbnailUrlForHash } from './media'
import {
  formatForPath,
  supportsAnnotation,
  type FormatDescriptor,
} from '../../shared/formats'
import type { SecretStore } from './secrets'
import type { ControlPlaneClient, InstallationDescriptor } from '../gateway-client/client'
import { portableSettings } from '../gateway-client/client'
import { decryptProviderKeys, encryptProviderKeys } from '../gateway-client/secret-envelope'
import { embeddingModelIdentity, search } from '../search'
import type { AiClient } from '../ai/client'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'
import {
  getActivityDashboard,
  reconcileUnestimatedAiCalls,
  recordAiCall,
  recordPersonalActivity,
} from '../analytics/repository'
import { getModelPrice, refreshPricingCatalog } from '../analytics/pricing'

// ── Settings defaults (implementation policy per C5, not contract) ──────

const SETTINGS_KEY = 'app-settings'
const INSTALLATION_ID_KEY = 'control-plane-installation-id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TELEMETRY_DEFAULT_MIGRATION_KEY = 'post03-telemetry-default-applied'
const SETTINGS_SYNC_DEFAULT_MIGRATION_KEY = 'post03-settings-sync-default-applied'
const TELEMETRY_NOTICE_VERSION = '2026-07-25'

/**
 * How often the removed-file retention sweep runs while the app is open. The
 * window itself is contractual (C1 `REMOVED_ASSET_RETENTION_DAYS`); this is
 * only how promptly an expired entry is noticed. A sweep also runs at startup,
 * so an app that is rarely open still catches up.
 */
const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: { theme: 'system' },
  // Background capture is on by default because a version history that only
  // records saves made while a window happens to be open is the failure the
  // product exists to prevent. Starting at login is deliberately NOT implied
  // by it: adding a startup entry is the user's decision to make, and this
  // build is unsigned (RESEARCH.md, 2026-07-26).
  system: { runInBackground: true, openAtLoginOpensWindow: false },
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
  /**
   * File the installation ID is mirrored to, outside the database. Optional:
   * without it the ID lives only in `settings` (the behavior tests rely on).
   */
  installationIdPath?: string
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
  /** Packaged Windows updater. Unsupported/dev builds use an inert fallback. */
  updater?: {
    getState: () => UpdateState
    checkForUpdates: () => Promise<UpdateState>
    restartToUpdate: () => Promise<void>
  }
  /**
   * Desktop shell integration. The tray/login-item wiring lives in the Electron
   * layer; this dep is what makes the C1 methods and the runInBackground side
   * effect testable. Absent in tests → the feature reports itself unsupported.
   */
  systemIntegration?: {
    /**
     * Re-reads the operating system's login item; never a cached copy. The
     * launch mode is not part of this — Windows cannot report it back — so
     * this layer composes the OS answer with the remembered C5 preference.
     */
    getState: () => Omit<SystemIntegrationState, 'openAtLoginOpensWindow'>
    setOpenAtLogin: (
      enabled: boolean,
      opensWindow: boolean,
    ) => Omit<SystemIntegrationState, 'openAtLoginOpensWindow'>
    /** Creates or removes the tray icon when the C5 preference changes. */
    applyRunInBackground: (enabled: boolean) => void
  }
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

function expectActivityDashboardQuery(value: unknown): ActivityDashboardQuery {
  if (!isPlainObject(value)) throw new TypeError('activity dashboard query must be an object')
  if (value['rangeDays'] !== 30 && value['rangeDays'] !== 90 &&
      value['rangeDays'] !== 365 && value['rangeDays'] !== 'all') {
    throw new TypeError('activity dashboard rangeDays must be 30, 90, 365, or all')
  }
  const timeZone = expectString(value['timeZone'], 'activity dashboard timeZone')
  if (value['refreshPricing'] !== undefined && typeof value['refreshPricing'] !== 'boolean') {
    throw new TypeError('activity dashboard refreshPricing must be a boolean')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    throw new TypeError('activity dashboard timeZone must be a valid IANA time zone')
  }
  return {
    rangeDays: value['rangeDays'],
    timeZone,
    ...(value['refreshPricing'] === true ? { refreshPricing: true } : {}),
  }
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
    if (key !== 'appearance' && key !== 'ai' && key !== 'controlPlane' && key !== 'system') {
      throw new TypeError(`Unknown settings key: ${key}`)
    }
  }
  const next = structuredClone(current)

  if (patch['system'] !== undefined) {
    const system = patch['system']
    if (!isPlainObject(system) || typeof system['runInBackground'] !== 'boolean') {
      throw new TypeError('settings.system.runInBackground must be a boolean')
    }
    if (
      system['openAtLoginOpensWindow'] !== undefined &&
      typeof system['openAtLoginOpensWindow'] !== 'boolean'
    ) {
      throw new TypeError('settings.system.openAtLoginOpensWindow must be a boolean')
    }
    next.system = {
      runInBackground: system['runInBackground'],
      openAtLoginOpensWindow:
        (system['openAtLoginOpensWindow'] as boolean | undefined) ??
        current.system.openAtLoginOpensWindow,
    }
  }

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

  /** Order-insensitive comparison of a folder's saved selection lists. */
  function sameSelection(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) return false
    const a = [...left].sort()
    const b = [...right].sort()
    return a.every((value, index) => value === b[index])
  }

  /** Assets stored under a tracked folder's path. */
  function assetsUnder(folderPath: string): ReturnType<typeof listAssets> {
    const root = path.resolve(folderPath)
    return listAssets(db).filter((asset) => {
      const relative = path.relative(root, asset.path)
      return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
    })
  }

  /**
   * After a folder's initial scan, mark assets whose files are gone.
   *
   * The watcher only reports deletions it witnesses, so a file removed while
   * Chronicle was closed would otherwise still look present — its history stays
   * (F3.7), but the UI must say the file is no longer on disk.
   */
  async function reconcileMissingFiles(folderPath: string): Promise<void> {
    let marked = 0
    for (const asset of assetsUnder(folderPath)) {
      if (!asset.onDisk) continue
      try {
        await fs.access(asset.path)
      } catch {
        const assetId = markFileMissing(db, asset.path)
        if (assetId !== null) emit('assetMissing', { assetId })
        marked += 1
      }
    }
    if (marked === 0) return
    diagnostic({
      level: 'debug',
      source: 'watcher',
      event: 'missing_files_reconciled',
      message: `Marked ${marked} asset(s) as no longer on disk after scanning a project.`,
      context: { count: marked },
    })
    pushStatus()
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
              deps.telemetry?.recordProductActivity('version-capture')
              recordPersonalActivity(db, 'version-capture', {
                assetId: result.version.assetId,
                projectId: owningFolder(candidate.path)?.id,
              })
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
        const assetId = markFileMissing(db, filePath)
        if (assetId === null) return // never captured, or already marked
        emit('assetMissing', { assetId })
        diagnostic({
          level: 'debug',
          source: 'watcher',
          event: 'file_removed',
          message: `Marked ${path.basename(filePath)} as missing.`,
          context: { fileName: path.basename(filePath) },
        })
      },
      onReady: (folderPath) => {
        void reconcileMissingFiles(folderPath).catch((error) => {
          console.error('[chronicle] could not reconcile missing files:', folderPath, error)
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

  /** Removes library blobs no surviving version references. Best effort. */
  async function removeOrphanBlobs(hashes: readonly string[]): Promise<void> {
    await Promise.all(
      hashes.map((hash) =>
        fs.rm(libraryFilePathFor(libraryRoot, hash), { force: true }).catch((error) => {
          console.warn('[chronicle] could not remove orphaned library blob:', hash, error)
        }),
      ),
    )
  }

  /**
   * Permanently erases assets and their stored bytes, then announces it.
   * Shared by the user's explicit delete and the retention sweep so both
   * paths clean up identically.
   */
  async function eraseAssets(assetIds: number[]): Promise<DeleteAssetHistoryResult> {
    if (assetIds.length === 0) return { deletedAssets: 0, deletedVersions: 0 }
    const deleted = deleteAssetsPermanently(db, assetIds)
    await removeOrphanBlobs(deleted.orphanedContentHashes)
    emit('assetsDeleted', { assetIds })
    pushStatus()
    return { deletedAssets: deleted.deletedAssets, deletedVersions: deleted.deletedVersions }
  }

  /**
   * F3.7 retention — a file that has been gone from disk for longer than the
   * contractual window has its history deleted permanently. Only removed files
   * expire; anything still on disk is untouched no matter how old it is.
   */
  async function purgeExpiredRemovedAssets(): Promise<void> {
    const cutoff = new Date(
      Date.now() - REMOVED_ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    const expired = listExpiredMissingAssetIds(db, cutoff)
    if (expired.length === 0) return
    const result = await eraseAssets(expired)
    diagnostic({
      level: 'debug',
      source: 'application',
      event: 'removed_assets_expired',
      message: `Deleted ${result.deletedAssets} removed file(s) whose ${REMOVED_ASSET_RETENTION_DAYS}-day retention window ended.`,
      context: {
        assetCount: result.deletedAssets,
        versionCount: result.deletedVersions,
        retentionDays: REMOVED_ASSET_RETENTION_DAYS,
      },
    })
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

  /**
   * The installation's stable random ID (POST-03). It is mirrored to a small
   * file beside the database so that resetting or deleting `chronicle.db` —
   * routine during development — does not register a brand-new installation
   * with the control plane. An app update touches neither copy, so updating
   * keeps the existing installation record and only bumps its app version.
   */
  function installationId(): string {
    const stored = getSetting<string>(db, INSTALLATION_ID_KEY)
    const mirrored = readMirroredInstallationId()
    const id = stored ?? mirrored ?? randomUUID()
    if (stored !== id) setSetting(db, INSTALLATION_ID_KEY, id)
    if (mirrored !== id && deps.installationIdPath) {
      try { writeFileSync(deps.installationIdPath, id, 'utf8') } catch { /* best effort */ }
    }
    return id
  }

  function readMirroredInstallationId(): string | undefined {
    if (!deps.installationIdPath) return undefined
    try {
      const contents = readFileSync(deps.installationIdPath, 'utf8').trim()
      return UUID_PATTERN.test(contents) ? contents : undefined
    } catch {
      return undefined
    }
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
    try {
      await deps.account.linkInstallation(installationId())
    } catch {
      // Account sign-in remains usable if installation linking is temporarily unavailable.
    }
    await applyRemoteSettings()
    try {
      const effective = await api.getSettings()
      await deps.account.recordTelemetryPreference(
        installationId(),
        effective.controlPlane.telemetryOptIn,
        TELEMETRY_NOTICE_VERSION,
      )
    } catch {
      // Preference audit is retried at the next startup/settings change.
    }
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

  /**
   * The format of the asset a version belongs to, from the registry. Null when
   * the asset's extension is no longer supported (history stays visible).
   */
  function formatOf(assetId: number): FormatDescriptor | null {
    const asset = getAsset(db, assetId)
    return asset ? formatForPath(asset.path) : null
  }

  /**
   * A queued annotation for a format the AI service cannot handle yet is
   * reported as 'deferred', not 'pending': the job stays in the queue and the
   * UI says so instead of implying a summary is seconds away (POST-02).
   */
  function aiStatusOf(version: VersionRecord, format: FormatDescriptor | null): AiStatus {
    if (version.aiStatus !== 'pending') return version.aiStatus
    return format && !supportsAnnotation(format) ? 'deferred' : 'pending'
  }

  function toVersionSummary(version: VersionRecord): VersionSummary {
    const format = formatOf(version.assetId)
    return {
      id: version.id,
      assetId: version.assetId,
      versionNumber: version.versionNumber,
      capturedAt: version.capturedAt,
      aiStatus: aiStatusOf(version, format),
      aiFailure: version.aiStatus === 'failed' ? aiFailureOf(version.id) : null,
      summary: summaryTextOf(version),
      thumbnailUrl: format ? thumbnailUrlForHash(version.contentHash, format.id) : null,
      format: format?.id ?? null,
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
        deps.telemetry?.recordProductActivity('project-create')
        recordPersonalActivity(db, 'project-create', { projectId: folder.id })
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
      const before = listTrackedFolders(db).find((folder) => folder.id === id)
      const updated = updateTrackedFolder(db, id, validatedPatch)
      if (!updated) throw new Error(`Unknown folder: ${folderId}`)

      // A changed file-type or exclusion selection changes which *existing*
      // files are capturable. The watcher's initial scan already ran, so
      // re-watch the folder to scan it again under the new rules — otherwise a
      // newly enabled file type would only be captured at its next save.
      // Capture dedupes by content hash, so re-scanning adds no versions for
      // files Chronicle already stores.
      const selectionChanged =
        before !== undefined &&
        (!sameSelection(before.allowedExtensions, updated.allowedExtensions) ||
          !sameSelection(before.excludedPaths, updated.excludedPaths))
      if (selectionChanged) {
        await watcher.unwatch(updated.path)
        watcher.watch(updated.path)
      }

      diagnostic({
        level: 'debug',
        source: 'project',
        event: 'project_updated',
        message: `Updated project ${updated.displayName}.`,
        context: {
          projectId: id,
          changedFields: Object.keys(validatedPatch),
          rescanned: selectionChanged,
        },
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
          await removeOrphanBlobs(deleted.orphanedContentHashes)
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
        const format = formatForPath(item.path)
        summaries.push({
          id: item.id,
          displayName: item.displayName,
          path: item.path,
          onDisk: item.onDisk,
          missingSince: item.missingSince,
          versionCount: item.versionCount,
          lastCapturedAt: item.lastCapturedAt ?? item.createdAt,
          lastSummary: item.lastSummary,
          thumbnailUrl: format ? thumbnailUrlForHash(latest.contentHash, format.id) : null,
          format: format?.id ?? null,
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
      const format = formatOf(version.assetId)
      const details: VersionDetails = {
        ...toVersionSummary(version),
        imageUrl: format ? imageUrlForHash(version.contentHash, format.id) : null,
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

    async deleteAssetHistory(assetIds) {
      if (!Array.isArray(assetIds)) throw new TypeError('assetIds must be an array')
      const ids = [...new Set(assetIds.map((value) => expectId(value, 'assetId')))]
      for (const id of ids) {
        const asset = getAsset(db, id)
        if (!asset) throw new Error(`Unknown asset: ${id}`)
        // Deleting is offered for files that are already gone. Refusing a live
        // file here means no UI mistake can erase history that is still being
        // added to; a whole project is deleted through removeFolder instead.
        if (asset.onDisk) {
          throw new Error(`${asset.displayName} is still on disk, so its history was not deleted`)
        }
      }
      const result = await eraseAssets(ids)
      diagnostic({
        level: 'debug',
        source: 'capture',
        event: 'removed_assets_deleted',
        message: `Permanently deleted ${result.deletedAssets} removed file(s).`,
        context: { assetCount: result.deletedAssets, versionCount: result.deletedVersions },
      })
      return result
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
      deps.telemetry?.recordProductActivity('restore')
      recordPersonalActivity(db, 'restore', {
        assetId: result.version.assetId,
        projectId: version ? owningFolder(getAsset(db, version.assetId)?.path ?? '')?.id : null,
      })
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
            const startedAt = Date.now()
            try {
              const response = await client.embedText({ provider, model: embeddingsModel, apiKey, text })
              recordAiCall(db, {
                operation: 'embedding',
                provider,
                model: embeddingsModel,
                success: true,
                latencyMs: Date.now() - startedAt,
                inputTokens: response.usage?.input_tokens,
                outputTokens: response.usage?.output_tokens,
                totalTokens: response.usage?.total_tokens,
              })
              return response.embedding
            } catch (error) {
              recordAiCall(db, {
                operation: 'embedding',
                provider,
                model: embeddingsModel,
                success: false,
                latencyMs: Date.now() - startedAt,
                errorCode: error instanceof Error ? error.name : null,
              })
              throw error
            }
          }
        }
      }

      const searchStart = Date.now()
      const results = await search(q, {
        db,
        embedQuery,
        embeddingsModel: embeddingModelIdentity(provider, embeddingsModel),
      })
      deps.telemetry?.recordSearch(embedQuery !== undefined)
      recordPersonalActivity(db, 'search')
      return results
    },

    async getActivityDashboard(query) {
      const validated = expectActivityDashboardQuery(query)
      await refreshPricingCatalog(db, { force: validated.refreshPricing })
      reconcileUnestimatedAiCalls(db)
      return getActivityDashboard(db, validated)
    },

    async getAiModelPrice(provider, model) {
      const validatedProvider = expectString(provider, 'provider')
      const validatedModel = expectString(model, 'model')
      await refreshPricingCatalog(db)
      return getModelPrice(db, validatedProvider, validatedModel)
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
      // Creating/removing the tray icon happens after the write so a failed
      // validation above cannot leave the shell and the stored preference
      // disagreeing. Capture itself is untouched either way.
      if (current.system.runInBackground !== next.system.runInBackground) {
        deps.systemIntegration?.applyRunInBackground(next.system.runInBackground)
        diagnostic({
          level: 'info',
          source: 'application',
          event: 'run_in_background_changed',
          message: next.system.runInBackground
            ? 'Chronicle will keep capturing in the tray when its window is closed.'
            : 'Chronicle will quit when its window is closed.',
          context: { runInBackground: next.system.runInBackground },
        })
      }
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
      if (wasOn !== next.controlPlane.telemetryOptIn && deps.account) {
        void deps.account.recordTelemetryPreference(
          installationId(),
          next.controlPlane.telemetryOptIn,
          TELEMETRY_NOTICE_VERSION,
        ).catch(() => {})
      }
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
    async getTelemetryDiagnostics() {
      return deps.telemetry?.diagnostics() ?? {
        enabled: false,
        pendingCount: 0,
        counts: {
          sessions: 0,
          projectRemovals: 0,
          searchHours: 0,
          aiUsageHours: 0,
          errors: 0,
          projects: 0,
          deletedProjects: 0,
        },
        nextBatch: null,
      }
    },
    async getAccountState() {
      return deps.account?.accountState() ?? { mode: 'local', email: null, isAdmin: false }
    },
    async getAdminStatistics(filters) {
      if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
        throw new TypeError('filters must be an object')
      }
      if (filters.periodDays !== undefined &&
          (!Number.isInteger(filters.periodDays) || filters.periodDays < 1 || filters.periodDays > 366)) {
        throw new TypeError('periodDays must be 1 to 366')
      }
      if (filters.allTime !== undefined && typeof filters.allTime !== 'boolean') {
        throw new TypeError('allTime must be a boolean')
      }
      if (filters.allTime && (filters.periodDays !== undefined ||
          filters.startDate !== undefined || filters.endDate !== undefined)) {
        throw new TypeError('allTime cannot be combined with another date range')
      }
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if ((filters.startDate === undefined) !== (filters.endDate === undefined)) {
        throw new TypeError('startDate and endDate must be provided together')
      }
      if ((filters.startDate && !datePattern.test(filters.startDate)) ||
          (filters.endDate && !datePattern.test(filters.endDate))) {
        throw new TypeError('custom dates must use YYYY-MM-DD')
      }
      return requireAccount().getAdminStatistics(filters)
    },
    async searchAdminAccounts(search) {
      return requireAccount().searchAdminAccounts(expectString(search, 'search').trim())
    },
    async setAdminRole(userId, enabled) {
      if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
      return requireAccount().setAdminRole(expectString(userId, 'userId'), enabled)
    },
    async deleteAdminErrorGroup(stackFingerprint) {
      const fingerprint = expectString(stackFingerprint, 'stackFingerprint')
      if (fingerprint.length < 16 || fingerprint.length > 128) {
        throw new TypeError('stackFingerprint must be 16 to 128 characters')
      }
      await requireAccount().deleteAdminErrorGroup(fingerprint)
    },
    async deleteAllAdminErrors() {
      await requireAccount().deleteAllAdminErrors()
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
      const account = requireAccount()
      const current = await account.accountState()
      if (current.mode === 'signed-in') {
        throw new Error('Sign out before continuing with another Google account')
      }
      if (!(await api.checkControlPlaneHealth())) {
        throw new Error('Google sign-in is temporarily unavailable')
      }
      const credential = await deps.googleCredential()
      const state = await account.loginWithGoogleCredential(credential)
      await afterSignIn()
      return state
    },
    async logout() {
      await deps.account?.logout()
    },
    async exportAccountData() {
      const account = requireAccount()
      const accountState = await account.accountState()
      const data = accountState.mode === 'signed-in'
        ? await account.exportAccountData()
        : await account.exportInstallationData(installationId())
      const destination = await deps.pickVersionCopyPath(
        `chronicle-account-data-${new Date().toISOString().slice(0, 10)}.json`,
      )
      if (!destination) return false
      writeFileSync(destination, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      return true
    },
    async deleteCloudUsageData() {
      await requireAccount().deleteInstallationData(installationId())
      const local = await api.getSettings()
      if (local.controlPlane.telemetryOptIn) {
        const disabled = mergeSettings(local, {
          controlPlane: { ...local.controlPlane, telemetryOptIn: false },
        })
        setSetting(db, SETTINGS_KEY, disabled)
        await deps.onTelemetryDisabled?.()
      }
    },
    async deleteCloudAccount() {
      await requireAccount().deleteAccount()
      const local = await api.getSettings()
      setSetting(db, SETTINGS_KEY, mergeSettings(local, {
        controlPlane: {
          ...local.controlPlane,
          settingsSyncEnabled: false,
          apiKeySyncEnabled: false,
        },
      }))
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
        const format = asset ? formatForPath(asset.path) : null
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
          thumbnailUrl:
            version && format ? thumbnailUrlForHash(version.contentHash, format.id) : null,
          format: format?.id ?? null,
          // An annotation job for a format the AI service cannot handle yet
          // waits here instead of failing (POST-02).
          deferred:
            job.jobType === 'ai_annotation' && format !== null && !supportsAnnotation(format),
        })
      }
      return pending
    },

    async getSystemIntegration() {
      const remembered = (await api.getSettings()).system.openAtLoginOpensWindow
      const shell = deps.systemIntegration?.getState()
      if (!shell) {
        return {
          openAtLoginSupported: false,
          openAtLogin: false,
          openAtLoginOpensWindow: remembered,
          trayActive: false,
          unsupportedReason: 'Starting at login is available in the installed app.',
        }
      }
      return { ...shell, openAtLoginOpensWindow: remembered }
    },

    async setOpenAtLogin(enabled, opensWindow) {
      if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean')
      if (typeof opensWindow !== 'boolean') throw new TypeError('opensWindow must be a boolean')
      if (!deps.systemIntegration) {
        throw new Error('Starting at login is not available in this build')
      }
      const shell = deps.systemIntegration.setOpenAtLogin(enabled, opensWindow)
      // Remember the mode only when the entry exists; a refused or removed
      // login item leaves the previous preference untouched.
      const current = await api.getSettings()
      if (shell.openAtLogin && current.system.openAtLoginOpensWindow !== opensWindow) {
        setSetting(db, SETTINGS_KEY, {
          ...current,
          system: { ...current.system, openAtLoginOpensWindow: opensWindow },
        })
      }
      const state: SystemIntegrationState = {
        ...shell,
        openAtLoginOpensWindow: shell.openAtLogin
          ? opensWindow
          : current.system.openAtLoginOpensWindow,
      }
      // A managed device can refuse the write, so report the OS's answer.
      if (state.openAtLogin !== enabled || (enabled && state.openAtLoginOpensWindow !== opensWindow)) {
        diagnostic({
          level: 'warn',
          source: 'application',
          event: 'open_at_login_rejected',
          message: 'The operating system did not apply the start-at-login preference.',
          context: {
            requested: enabled,
            requestedOpensWindow: opensWindow,
            actual: state.openAtLogin,
            actualOpensWindow: state.openAtLoginOpensWindow,
          },
        })
      }
      return state
    },

    async getUpdateState() {
      return deps.updater?.getState() ?? {
        phase: 'unsupported',
        currentVersion: deps.installation?.appVersion ?? '0.0.0',
        availableVersion: null,
        percent: null,
        checkedAt: null,
        error: null,
      }
    },

    async checkForUpdates() {
      return deps.updater?.checkForUpdates() ?? api.getUpdateState()
    },

    async restartToUpdate() {
      if (!deps.updater) throw new Error('Application updates are unavailable in this build')
      await deps.updater.restartToUpdate()
    },
  }

  let retentionTimer: ReturnType<typeof setInterval> | undefined

  return {
    api,
    start(): void {
      for (const folder of listTrackedFolders(db)) watcher.watch(folder.path)
      const sweep = (): void => {
        void purgeExpiredRemovedAssets().catch((error) => {
          console.error('[chronicle] removed-file retention sweep failed:', error)
        })
      }
      sweep()
      retentionTimer = setInterval(sweep, RETENTION_SWEEP_INTERVAL_MS)
      // Warm the pricing cache independently of AI work. A network failure is
      // non-fatal and leaves the last valid cache in place.
      void refreshPricingCatalog(db)
        .then(() => {
          reconcileUnestimatedAiCalls(db)
        })
        // Non-fatal by design: an unreachable catalog, or a shutdown that
        // closed the database first, must not surface as an unhandled
        // rejection. The last valid cache stays in place either way.
        .catch(() => {})
      if (deps.account && deps.installation) {
        void deps.account.registerInstallation({
          ...deps.installation,
          installationId: installationId(),
        }).then(async () => {
          const local = await api.getSettings()
          await deps.account!.recordTelemetryPreference(
            installationId(),
            local.controlPlane.telemetryOptIn,
            TELEMETRY_NOTICE_VERSION,
          )
        }).catch(() => {})
      }
      deps.telemetry?.recordAppOpened()
    },
    dispose(): Promise<void> {
      if (retentionTimer) clearInterval(retentionTimer)
      retentionTimer = undefined
      return watcher.close()
    },
  }
}
