/**
 * IPC channel naming (implementation of C1 — the contract itself is
 * src/shared/ipc.ts and is not edited here). One channel per `ChronicleApi`
 * method and per `ChronicleEvents` event, derived mechanically so main and
 * preload can never disagree.
 *
 * The `satisfies Record<keyof …, true>` maps make the lists exhaustive at
 * compile time: adding a method or event to C1 breaks this file until it is
 * wired, and a typo'd extra key is rejected.
 *
 * Imported by both the main process and the preload script (it is the one
 * deliberate preload → main/ipc import; the module is pure constants).
 */
import type { ChronicleApi, ChronicleEventName, ChronicleEvents } from '../../shared/ipc'

const API_METHODS = {
  setWindowTheme: true,
  reportRendererError: true,
  listFolders: true,
  pickFolder: true,
  scanFolder: true,
  addFolder: true,
  updateFolder: true,
  removeFolder: true,
  listAssets: true,
  getTimeline: true,
  getVersionDetails: true,
  resetAssetHistory: true,
  restoreVersion: true,
  saveVersionCopy: true,
  search: true,
  retryAnnotation: true,
  retryAllFailedJobs: true,
  getSettings: true,
  updateSettings: true,
  setApiKey: true,
  clearApiKey: true,
  configuredProviders: true,
  testAiConfiguration: true,
  checkControlPlaneHealth: true,
  probeControlPlaneHealth: true,
  listControlPlaneDiagnostics: true,
  clearControlPlaneDiagnostics: true,
  listApplicationDiagnostics: true,
  getTelemetryDiagnostics: true,
  getAccountState: true,
  getAdminStatistics: true,
  searchAdminAccounts: true,
  register: true,
  login: true,
  loginWithGoogle: true,
  logout: true,
  syncSettings: true,
  syncApiKeys: true,
  restoreApiKeys: true,
  disableApiKeySync: true,
  getAppStatus: true,
  listPendingJobs: true,
} as const satisfies Record<keyof ChronicleApi, true>

const EVENTS = {
  versionCaptured: true,
  assetHistoryReset: true,
  annotationUpdated: true,
  statusChanged: true,
  fileSkipped: true,
  controlPlaneDiagnostic: true,
  applicationDiagnostic: true,
} as const satisfies Record<ChronicleEventName, true>

export const API_METHOD_NAMES = Object.keys(API_METHODS) as ReadonlyArray<keyof ChronicleApi>
export const EVENT_NAMES = Object.keys(EVENTS) as ReadonlyArray<ChronicleEventName>

export function apiChannel(method: keyof ChronicleApi): string {
  return `chronicle:${method}`
}

export function eventChannel(event: ChronicleEventName): string {
  return `chronicle-event:${event}`
}

/** Push one typed C1 event to the renderer(s). Implemented by register.ts; tests inject a recorder. */
export type EmitEvent = <E extends ChronicleEventName>(event: E, payload: ChronicleEvents[E]) => void
