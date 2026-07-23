/**
 * POST-04 — content-free telemetry payload builders (F8).
 *
 * This is the allowlist. Every field that may appear in a telemetry payload is
 * declared here explicitly. Nothing that isn't declared can serialise out — the
 * builders accept only their typed parameters, and the unit tests assert that
 * forbidden data (assetId, versionId, path, query, exact byte size, hash) cannot
 * appear in any returned object even if a caller tries to smuggle it in.
 *
 * Queued as `job_type = 'telemetry'` in SQLite and delivered in batches by
 * TelemetryWorker when the app is online and `telemetryOptIn` is true.
 */
import { randomUUID } from 'node:crypto'

// ── Allowed values ──────────────────────────────────────────────────────

export type AllowedFileType = 'png' | 'jpg' | 'other'
export type SizeBucket = '<100KB' | '100KB-1MB' | '1-10MB' | '10-50MB'
export type ResultCountBucket = '0' | '1-5' | '6-20' | '21+'

/** Normalise an extension string ("png", ".PNG", ".jpg"…) to an allowlisted type. */
export function normaliseFileType(ext: string): AllowedFileType {
  const clean = ext.toLowerCase().replace(/^\./, '')
  if (clean === 'png') return 'png'
  if (clean === 'jpg' || clean === 'jpeg') return 'jpg'
  return 'other'
}

/** Map exact byte count to the coarse bucket — exact sizes never leave the device. */
export function sizeBucket(bytes: number): SizeBucket {
  if (bytes < 100_000) return '<100KB'
  if (bytes < 1_000_000) return '100KB-1MB'
  if (bytes < 10_000_000) return '1-10MB'
  return '10-50MB'
}

/** Map a result count to the coarse bucket. */
export function resultCountBucket(count: number): ResultCountBucket {
  if (count === 0) return '0'
  if (count <= 5) return '1-5'
  if (count <= 20) return '6-20'
  return '21+'
}

// ── Shared base ─────────────────────────────────────────────────────────

interface TelemetryBase {
  schema_version: 1
  id: string
  occurred_at: string
  installation_id: string
  project_telemetry_id?: string
}

function base(installationId: string, projectTelemetryId?: string): TelemetryBase {
  return {
    schema_version: 1,
    id: randomUUID(),
    occurred_at: new Date().toISOString(),
    installation_id: installationId,
    ...(projectTelemetryId !== undefined ? { project_telemetry_id: projectTelemetryId } : {}),
  }
}

// ── Event builders ──────────────────────────────────────────────────────

export interface AppOpenedPayload extends TelemetryBase {
  event: 'app_opened'
  app_version: string
  os_family: 'windows' | 'macos' | 'linux' | 'other'
}

export function buildAppOpened(
  installationId: string,
  appVersion: string,
  osFamilyRaw: string,
): AppOpenedPayload {
  const os = ['windows', 'macos', 'linux'].includes(osFamilyRaw)
    ? (osFamilyRaw as 'windows' | 'macos' | 'linux')
    : 'other'
  return { ...base(installationId), event: 'app_opened', app_version: appVersion, os_family: os }
}

export interface VersionCapturedPayload extends TelemetryBase {
  event: 'version_captured'
  file_type: AllowedFileType
  size_bucket: SizeBucket
  capture_ms: number
}

export function buildVersionCaptured(
  installationId: string,
  projectTelemetryId: string | undefined,
  fileExtension: string,
  sizeBytes: number,
  captureMs: number,
): VersionCapturedPayload {
  return {
    ...base(installationId, projectTelemetryId),
    event: 'version_captured',
    file_type: normaliseFileType(fileExtension),
    size_bucket: sizeBucket(sizeBytes),
    capture_ms: Math.max(0, Math.round(captureMs)),
  }
}

export interface AiSummaryGeneratedPayload extends TelemetryBase {
  event: 'ai_summary_generated'
  operation: 'annotation' | 'embedding'
  provider: string
  model: string
  outcome: 'success' | 'failure'
  latency_ms: number
  input_tokens?: number
  output_tokens?: number
}

export function buildAiSummaryGenerated(
  installationId: string,
  projectTelemetryId: string | undefined,
  operation: 'annotation' | 'embedding',
  provider: string,
  model: string,
  outcome: 'success' | 'failure',
  latencyMs: number,
  tokens?: { input?: number; output?: number },
): AiSummaryGeneratedPayload {
  const payload: AiSummaryGeneratedPayload = {
    ...base(installationId, projectTelemetryId),
    event: 'ai_summary_generated',
    operation,
    provider,
    model,
    outcome,
    latency_ms: Math.max(0, Math.round(latencyMs)),
  }
  if (tokens?.input !== undefined) payload.input_tokens = tokens.input
  if (tokens?.output !== undefined) payload.output_tokens = tokens.output
  return payload
}

export interface SearchPerformedPayload extends TelemetryBase {
  event: 'search_performed'
  mode: 'keyword' | 'semantic' | 'hybrid'
  latency_ms: number
  result_count_bucket: ResultCountBucket
}

export function buildSearchPerformed(
  installationId: string,
  mode: 'keyword' | 'semantic' | 'hybrid',
  latencyMs: number,
  resultCount: number,
): SearchPerformedPayload {
  return {
    ...base(installationId),
    event: 'search_performed',
    mode,
    latency_ms: Math.max(0, Math.round(latencyMs)),
    result_count_bucket: resultCountBucket(resultCount),
  }
}

export interface ProjectAddedPayload extends TelemetryBase {
  event: 'project_added'
}

export function buildProjectAdded(installationId: string, projectTelemetryId: string): ProjectAddedPayload {
  return { ...base(installationId, projectTelemetryId), event: 'project_added' }
}

export interface ProjectRemovedPayload extends TelemetryBase {
  event: 'project_removed'
  /** Whether all local history was also permanently deleted. */
  history_deleted: boolean
}

export function buildProjectRemoved(
  installationId: string,
  projectTelemetryId: string,
  historyDeleted: boolean,
): ProjectRemovedPayload {
  return { ...base(installationId, projectTelemetryId), event: 'project_removed', history_deleted: historyDeleted }
}

export interface AiProviderConfiguredPayload extends TelemetryBase {
  event: 'ai_provider_configured'
  /** The allowlisted provider identifier, e.g. "google_genai", "openai". */
  provider: string
}

export function buildAiProviderConfigured(installationId: string, provider: string): AiProviderConfiguredPayload {
  return { ...base(installationId), event: 'ai_provider_configured', provider }
}

export interface AccountSignedInPayload extends TelemetryBase {
  event: 'account_signed_in'
  method: 'google' | 'password'
}

export function buildAccountSignedIn(installationId: string, method: 'google' | 'password'): AccountSignedInPayload {
  return { ...base(installationId), event: 'account_signed_in', method }
}

export interface RestorePerformedPayload extends TelemetryBase {
  event: 'restore_performed'
  file_type: AllowedFileType
}

export function buildRestorePerformed(
  installationId: string,
  projectTelemetryId: string | undefined,
  fileExtension: string,
): RestorePerformedPayload {
  return {
    ...base(installationId, projectTelemetryId),
    event: 'restore_performed',
    file_type: normaliseFileType(fileExtension),
  }
}

export interface VersionHistoryResetPayload extends TelemetryBase {
  event: 'version_history_reset'
}

export function buildVersionHistoryReset(
  installationId: string,
  projectTelemetryId: string | undefined,
): VersionHistoryResetPayload {
  return { ...base(installationId, projectTelemetryId), event: 'version_history_reset' }
}

export type TelemetryPayload =
  | AppOpenedPayload
  | VersionCapturedPayload
  | AiSummaryGeneratedPayload
  | SearchPerformedPayload
  | ProjectAddedPayload
  | ProjectRemovedPayload
  | AiProviderConfiguredPayload
  | AccountSignedInPayload
  | RestorePerformedPayload
  | VersionHistoryResetPayload

// ── Project inventory helpers ───────────────────────────────────────────

export interface ProjectInventoryPayload {
  tracked_file_count: number
  file_type_counts: Record<AllowedFileType, number>
}

/**
 * Build a content-free project inventory object from raw counts.
 * Extensions outside the allowlist are bucketed into "other".
 */
export function buildProjectInventory(
  files: Array<{ ext: string }>,
): ProjectInventoryPayload {
  const counts: Record<AllowedFileType, number> = { png: 0, jpg: 0, other: 0 }
  for (const { ext } of files) counts[normaliseFileType(ext)]++
  return { tracked_file_count: files.length, file_type_counts: counts }
}
