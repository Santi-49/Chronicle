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

import type { AppSettings } from './settings'

// ── Data shapes ────────────────────────────────────────────────────────

export type AiStatus = 'pending' | 'done' | 'failed' | 'none' // 'none' = restore versions, no AI needed

export interface TrackedFolder {
  id: number
  path: string
  addedAt: string // ISO 8601, like all dates here
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

export interface AccountState {
  mode: 'local' | 'signed-in'
  email: string | null
  isAdmin: boolean
}

export interface AppStatus {
  watchedFolders: number
  online: boolean
  pendingJobs: { ai: number; embedding: number; telemetry: number }
  aiConfigured: boolean // false → UI shows "configure AI in Settings"
}

// ── Renderer → main (request/response) ─────────────────────────────────

export interface ChronicleApi {
  // F2 — tracked folders
  listFolders(): Promise<TrackedFolder[]>
  /** Opens the native folder picker; null if the user cancels. */
  addFolder(): Promise<TrackedFolder | null>
  removeFolder(folderId: number): Promise<void>

  // F5 — assets, timeline, details
  listAssets(): Promise<AssetSummary[]>
  getTimeline(assetId: number): Promise<VersionSummary[]>
  getVersionDetails(versionId: number): Promise<VersionDetails>

  // F6 — restore
  restoreVersion(versionId: number): Promise<RestoreResult>
  /** Fallback when the original folder is gone; path from a native save dialog. */
  saveVersionCopy(versionId: number): Promise<void>

  // F7 — search
  search(query: string): Promise<SearchResult[]>

  // F4 — AI
  retryAnnotation(versionId: number): Promise<void> // re-queues; result arrives as annotationUpdated

  // C5 — settings (secrets handled separately, see below)
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  setApiKey(key: string): Promise<void> // encrypted via safeStorage; never readable back
  hasApiKey(): Promise<boolean>
  clearApiKey(): Promise<void>

  // F1 — account (low priority; everything above works in 'local' mode)
  getAccountState(): Promise<AccountState>
  register(email: string, password: string): Promise<AccountState>
  login(email: string, password: string): Promise<AccountState>
  logout(): Promise<void>

  // Status bar
  getAppStatus(): Promise<AppStatus>
}

// ── Main → renderer (push events) ──────────────────────────────────────

export interface ChronicleEvents {
  /** A new version landed (F3) — refresh Assets/Timeline, toast. */
  versionCaptured: { assetId: number; versionId: number }
  /** AI job finished or failed (F4) — update status chips. */
  annotationUpdated: { versionId: number; aiStatus: AiStatus }
  /** Anything in AppStatus changed — update the status bar. */
  statusChanged: AppStatus
  /** A file was seen but skipped (F3 rule 6) — toast. */
  fileSkipped: { fileName: string; reason: 'too-large' }
}

export type ChronicleEventName = keyof ChronicleEvents

// ── Bridge shape (what preload exposes as `window.chronicle`) ──────────

export interface ChronicleBridge extends ChronicleApi {
  on<E extends ChronicleEventName>(
    event: E,
    listener: (payload: ChronicleEvents[E]) => void,
  ): () => void // returns unsubscribe
}
