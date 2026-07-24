/**
 * C1 — IPC contract between the renderer (React UI) and the main process.
 *
 * The single source of truth for everything that crosses the Electron bridge.
 * Imported by main (handler implementations), preload (contextBridge), and
 * renderer (typed `window.chronicle`). UI work can start immediately against
 * a mocked implementation of `ChronicleApi`.
 *
 * Rules:
 *   - Request/response only via `ChronicleApi`; push via `ChronicleEvents`.
 *   - Images reach the renderer as URLs (`chronicle://` protocol served by
 *     main from the library) — never as raw bytes over IPC.
 *   - No AI or network call is awaited by any UI action (spec §6.5): slow
 *     work returns immediately and completion arrives as an event.
 */
export interface AdminAccountSummary {
  id: string; email: string; display_name: string; google_linked: boolean
  installation_count: number; current_project_count: number; current_version_count: number
}
export interface AdminStatistics {
  generated_at: string; period_days: number
  overview: {
    registered_accounts: number; registered_installations: number
    estimated_active_installations: number; reporting_installations: number
    current_projects: number; tracked_files: number; current_versions: number
    weekly_active_creative_installations: number; versions_captured: number
    project_creations: number; restores: number
    activation_rate: number; d7_retention_rate: number
  }
  inventory_averages: {
    projects_per_registered_account: number; projects_per_registered_installation: number
    tracked_files_per_project: number; versions_per_project: number
    median_versions_per_project: number
  }
  file_type_distribution: { label: string; count: number }[]
  version_inventory_over_time: { bucket_start: string; count: number }[]
  ai: {
    attempt_count: number; success_count: number; failure_count: number
    success_rate: number; average_latency_ms: number; token_counts_available?: boolean
    total_token_count?: number | null
    provider_model_mix: unknown[]; over_time: { bucket_start: string; count: number }[]
  }
  search: {
    total_count: number; mode_counts_available?: boolean
    by_mode: { label: string; count: number }[]; over_time: { bucket_start: string; count: number }[]
  }
  errors: {
    component: string; error_name: string; error_code?: string | null; stack_fingerprint: string
    severity: 'warning' | 'error' | 'fatal'; count: number; last_seen_at: string
  }[]
  coarse_locations: { label: string; count: number }[]
}

import type { AppSettings } from './settings'

// ── Data shapes ────────────────────────────────────────────────────────

export type WindowTheme = 'dark' | 'light'

export type AiStatus = 'pending' | 'done' | 'failed' | 'none' // 'none' = restore versions, no AI needed
export interface AiFailure {
  /** Safe provider/service explanation; never contains credentials or request content. */
  message: string
  code: string | null
  status: number | null
}

export interface AiConfigurationTestResult {
  task: 'chat' | 'embeddings'
  provider: string
  model: string
  valid: boolean
  reachable: boolean
  message: string
}

export interface TrackedFolder {
  id: number
  path: string
  addedAt: string // ISO 8601, like all dates here
  /** User-facing name; defaults to the folder's base name when first tracked. */
  displayName: string
  /** Optional user-authored project context; empty when no description was provided. */
  description: string
  /** Icon identifier the renderer interprets — a Material Symbol name or a 1–2 char glyph. */
  icon: string
  /** Accent color as a hex string (e.g. "#4589ff"). */
  color: string
  /**
   * Absolute file paths the user chose NOT to track. The watcher skips these
   * on both the initial scan and live saves until they are removed from this
   * list. Empty means "track every supported file in the tree".
   */
  excludedPaths: string[]
  /**
   * Enabled file extensions (lowercase, dot-prefixed, e.g. ".png"). A file
   * whose extension is not listed is not captured. Always the concrete enabled
   * set — defaults to every supported extension when a folder is first tracked.
   */
  allowedExtensions: string[]
}

/** Partial update of a tracked folder's presentation + tracking fields (all optional). */
export interface FolderMetaPatch {
  displayName?: string
  description?: string
  icon?: string
  color?: string
  excludedPaths?: string[]
  allowedExtensions?: string[]
}

/** One supported file found by `scanFolder`, before any exclusion is applied. */
export interface FolderScanEntry {
  /** Absolute path (matches the values stored in `TrackedFolder.excludedPaths`). */
  path: string
  /** Path relative to the scanned folder root, for building the tree UI. */
  relativePath: string
  sizeBytes: number
  /** Lowercase, dot-prefixed extension (e.g. ".png"). */
  ext: string
}

export interface AssetSummary {
  id: number
  displayName: string
  path: string
  onDisk: boolean
  versionCount: number
  lastCapturedAt: string
  lastSummary: string | null
  thumbnailUrl: string
}

export interface VersionSummary {
  id: number
  assetId: number
  versionNumber: number
  capturedAt: string
  aiStatus: AiStatus
  aiFailure: AiFailure | null
  summary: string | null // null while pending/failed; "Restored from version N" for restores
  thumbnailUrl: string
}

export interface VersionDetails extends VersionSummary {
  imageUrl: string
  contentHash: string
  sizeBytes: number
  width: number
  height: number
  changes: string[]
  tags: string[]
  aiProvider: string | null
  restoredFromVersion: number | null
}

export interface SearchResult {
  version: VersionSummary
  assetName: string
  /** Snippet of the matched summary/tags, for display. */
  snippet: string
  matchedBy: 'keyword' | 'semantic' | 'both'
}

export type RestoreResult =
  | { ok: true; newVersionNumber: number }
  | { ok: false; reason: 'folder-missing' } // → UI offers "Save a copy…"

/** Result of the explicit destructive history reset operation. */
export interface ResetHistoryResult {
  /** Fresh row for the latest snapshot, now the asset's sole version (v1). */
  versionId: number
}

/** Whether removing a project retains or permanently erases its local history. */
export type ProjectRemovalMode = 'keep-history' | 'delete-history'

export interface AccountState {
  mode: 'local' | 'signed-in'
  email: string | null
  isAdmin: boolean
}

export interface AppStatus {
  watchedFolders: number
  online: boolean
  pendingJobs: { ai: number; embedding: number; telemetry: number }
  /** Exhausted/non-retryable AI jobs waiting for an explicit user retry. */
  failedJobs: number
  aiConfigured: boolean // false → UI shows "configure AI in Settings"
}

/** Renderer-safe view of an AI queue item. Raw internal payloads never cross IPC. */
export interface PendingJob {
  id: number
  jobType: 'ai_annotation' | 'embedding'
  queuedAt: string
  retryCount: number
  state: 'pending' | 'failed'
  lastError: AiFailure | null
  versionId: number | null
  assetId: number | null
  assetName: string | null
  versionNumber: number | null
  thumbnailUrl: string | null
}

/** Sanitized record of one outbound Chronicle control-plane request. */
export interface ControlPlaneDiagnostic {
  id: number
  timestamp: string
  kind: 'health' | 'request'
  method: string
  url: string
  requestHeaders: Record<string, string>
  /** Exact JSON-compatible request payload after secret-bearing fields are redacted. */
  requestBody: unknown | null
  /** Sanitized JSON/text response payload, including error details when the server provides them. */
  responseBody: unknown | null
  status: number | null
  ok: boolean
  durationMs: number
  error: string | null
}

export type TelemetryOsFamily = 'windows' | 'macos' | 'linux' | 'other'
export type TelemetryAiOperation = 'annotation' | 'embedding'
export type TelemetryErrorProcess = 'main' | 'renderer' | 'preload' | 'electron'

export interface TelemetryAppSession {
  id: string
  opened_at: string
  app_version: string
  os_family: TelemetryOsFamily
  first_project_at?: string
  first_version_at?: string
}

export interface TelemetryProjectRemoval {
  id: string
  project_telemetry_id: string
  occurred_at: string
  history_deleted: boolean
}

export interface TelemetryHourlyUsage {
  bucket_start: string
  search_count: number
  keyword_search_count?: number
  semantic_search_count?: number
  version_capture_count?: number
  restore_count?: number
  project_create_count?: number
}

export interface TelemetryHourlyAiUsage {
  bucket_start: string
  operation: TelemetryAiOperation
  provider: string
  model: string
  attempt_count: number
  success_count: number
  failure_count: number
  total_latency_ms: number
}

export interface TelemetryAppError {
  id: string
  occurred_at: string
  process: TelemetryErrorProcess
  component: string
  operation: string
  error_name: string
  error_code?: string
  sanitized_message: string
  stack_fingerprint: string
  sanitized_stack: string[]
  severity: 'warning' | 'error' | 'fatal'
  fatal: boolean
  handled: boolean
  app_version: string
  os_family: TelemetryOsFamily
  provider?: string
  model?: string
}

export interface TelemetryInstallationState {
  captured_at: string
  project_count: number
  asset_count: number
  version_count: number
  ai_annotated_version_count: number
  annotation_provider?: string
  annotation_model?: string
  embedding_provider?: string
  embedding_model?: string
  app_version: string
  os_family: TelemetryOsFamily
}

export interface TelemetryProjectState {
  project_telemetry_id: string
  captured_at: string
  asset_count: number
  version_count: number
  ai_annotated_version_count: number
  png_count: number
  jpg_count: number
  other_count: number
}

/** Exact privacy-sanitized v2 wire envelope used by the next delivery attempt. */
export interface TelemetryBatch {
  schema_version: 2
  batch_id: string
  installation_id: string
  sent_at: string
  final: boolean
  sessions: TelemetryAppSession[]
  project_removals: TelemetryProjectRemoval[]
  hourly_usage: TelemetryHourlyUsage[]
  hourly_ai_usage: TelemetryHourlyAiUsage[]
  errors: TelemetryAppError[]
  installation_state?: TelemetryInstallationState
  projects: TelemetryProjectState[]
  deleted_project_ids: string[]
}

export interface TelemetryPendingCounts {
  sessions: number
  projectRemovals: number
  searchHours: number
  aiUsageHours: number
  errors: number
  projects: number
  deletedProjects: number
}

/** Developer-only inspection of the persistent v2 buffer. It never consumes records. */
export interface TelemetryDiagnostics {
  enabled: boolean
  pendingCount: number
  counts: TelemetryPendingCounts
  /** Null when reporting is disabled or no data/snapshot has changed. */
  nextBatch: TelemetryBatch | null
}

export type ApplicationDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'
export type ApplicationDiagnosticSource =
  | 'application'
  | 'project'
  | 'capture'
  | 'watcher'
  | 'ai'
  | 'telemetry'
  | 'control-plane'

/** Structured main-process event exposed only through Developer Diagnostics. */
export interface ApplicationDiagnostic {
  id: number
  timestamp: string
  level: ApplicationDiagnosticLevel
  source: ApplicationDiagnosticSource
  event: string
  message: string
  /** Sanitized, JSON-compatible debugging metadata. Never contains credentials. */
  context: unknown | null
}

/** Sanitized renderer failure forwarded to the trusted main-process reporter. */
export interface RendererErrorReport {
  source: 'renderer' | 'preload'
  kind: 'error' | 'unhandledrejection'
  message: string
  name?: string
  stack?: string
  occurredAt: string
}

// ── Renderer → main (request/response) ─────────────────────────────────

export interface ChronicleApi {
  // Native window chrome — keeps Electron's caption controls aligned with the renderer theme.
  setWindowTheme(theme: WindowTheme): Promise<void>
  /** Reports an unexpected renderer failure; never accepts arbitrary context or user data. */
  reportRendererError(report: RendererErrorReport): Promise<void>

  // F2 — tracked folders
  listFolders(): Promise<TrackedFolder[]>
  /** Opens the native folder picker and returns the chosen path; null if cancelled. No side effects. */
  pickFolder(): Promise<string | null>
  /**
   * Lists every supported (png/jpg/jpeg) file under a folder tree, skipping
   * hidden and temporary files. Read-only — used by the New Project flow to
   * preview matches and let the user deselect files/types before tracking.
   */
  scanFolder(folderPath: string): Promise<FolderScanEntry[]>
  /** Tracks a folder (idempotent by path). `meta` optional; displayName defaults to the base name. */
  addFolder(folderPath: string, meta?: FolderMetaPatch): Promise<TrackedFolder>
  /** Updates a tracked folder's presentation fields. */
  updateFolder(folderId: number, patch: FolderMetaPatch): Promise<TrackedFolder>
  /** Stops tracking a folder; permanent deletion also erases its assets and version history. */
  removeFolder(folderId: number, mode?: ProjectRemovalMode): Promise<void>

  // F5 — assets, timeline, details
  listAssets(): Promise<AssetSummary[]>
  getTimeline(assetId: number): Promise<VersionSummary[]>
  getVersionDetails(versionId: number): Promise<VersionDetails>
  /** Destructive: replaces an asset's timeline with its latest snapshot as a fresh v1. */
  resetAssetHistory(assetId: number): Promise<ResetHistoryResult>

  // F6 — restore
  restoreVersion(versionId: number): Promise<RestoreResult>
  /** Fallback when the original folder is gone; path from a native save dialog. */
  saveVersionCopy(versionId: number): Promise<void>

  // F7 — search
  search(query: string): Promise<SearchResult[]>

  // F4 — AI
  retryAnnotation(versionId: number): Promise<void> // re-queues; result arrives as annotationUpdated
  /** Requeues every failed annotation/embedding job; never retries them automatically. */
  retryAllFailedJobs(): Promise<number>

  // C5 — settings (secrets handled separately, see below)
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  // BYOK keys are stored per provider, encrypted via safeStorage, and never
  // readable back over IPC. Saving a key per provider lets a task's provider be
  // switched without re-entering credentials.
  setApiKey(provider: string, key: string): Promise<void>
  clearApiKey(provider: string): Promise<void>
  /** Provider ids that currently have a saved key (for "Saved" badges / readiness). */
  configuredProviders(): Promise<string[]>
  /** Runs the real task-specific provider/model/key probe without saving settings. */
  testAiConfiguration(
    task: 'chat' | 'embeddings',
    provider: string,
    model: string,
  ): Promise<AiConfigurationTestResult>

  // F1 — account (low priority; everything above works in 'local' mode)
  /** Reachability/configuration preflight; never throws for ordinary connection failures. */
  checkControlPlaneHealth(): Promise<boolean>
  /** Developer diagnostic health probe; checks the service independently of OAuth configuration. */
  probeControlPlaneHealth(): Promise<boolean>
  /** Bounded, sanitized audit of outbound requests; never contains credentials or plaintext keys. */
  listControlPlaneDiagnostics(): Promise<ControlPlaneDiagnostic[]>
  /** Clears only the current session's in-memory control-plane request audit. */
  clearControlPlaneDiagnostics(): Promise<void>
  /** Bounded, sanitized lifecycle/error log from the Electron main process. */
  listApplicationDiagnostics(): Promise<ApplicationDiagnostic[]>
  /** Current v2 usage buffer and an exact, non-consuming preview of the next batch. */
  getTelemetryDiagnostics(): Promise<TelemetryDiagnostics>
  getAccountState(): Promise<AccountState>
  getAdminStatistics(periodDays: number, accountId?: string, country?: string, osFamily?: string): Promise<AdminStatistics>
  searchAdminAccounts(search: string): Promise<AdminAccountSummary[]>
  register(email: string, password: string): Promise<AccountState>
  login(email: string, password: string): Promise<AccountState>
  /** System-browser Google OAuth with desktop PKCE; returns after Chronicle JWT issuance. */
  loginWithGoogle(): Promise<AccountState>
  logout(): Promise<void>
  /** Push the current portable C5 preferences now (requires a signed-in account). */
  syncSettings(): Promise<void>
  /** Encrypt all saved provider keys client-side and upload one opaque envelope. */
  syncApiKeys(passphrase: string): Promise<void>
  /** Download/decrypt the opaque envelope into safeStorage; plaintext never reaches renderer. */
  restoreApiKeys(passphrase: string): Promise<void>
  /** Delete the server envelope and disable future API-key sync. */
  disableApiKeySync(): Promise<void>

  // Status bar
  getAppStatus(): Promise<AppStatus>
  /** FIFO list backing the status bar's pending AI-job count. */
  listPendingJobs(): Promise<PendingJob[]>
}

// ── Main → renderer (push events) ──────────────────────────────────────

export interface ChronicleEvents {
  /** A new version landed (F3) — refresh Assets/Timeline, toast. */
  versionCaptured: { assetId: number; versionId: number }
  /** An asset now has one fresh v1; all asset/timeline/detail views must refresh. */
  assetHistoryReset: { assetId: number; versionId: number }
  /** AI job finished or failed (F4) — update status chips. */
  annotationUpdated: { versionId: number; aiStatus: AiStatus }
  /** Anything in AppStatus changed — update the status bar. */
  statusChanged: AppStatus
  /** A file was seen but skipped (F3 rule 6) — toast. */
  fileSkipped: { fileName: string; reason: 'too-large' }
  /** One sanitized control-plane request completed — update developer diagnostics. */
  controlPlaneDiagnostic: ControlPlaneDiagnostic
  /** One structured application lifecycle/error event — update developer diagnostics. */
  applicationDiagnostic: ApplicationDiagnostic
}

export type ChronicleEventName = keyof ChronicleEvents

// ── Bridge shape (what preload exposes as `window.chronicle`) ──────────

export interface ChronicleBridge extends ChronicleApi {
  on<E extends ChronicleEventName>(
    event: E,
    listener: (payload: ChronicleEvents[E]) => void,
  ): () => void // returns unsubscribe
}
