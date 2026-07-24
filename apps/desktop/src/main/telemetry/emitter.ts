/**
 * Privacy-safe usage-statistics collector.
 *
 * Independent records are accumulated in one local SQLite settings row, then
 * delivered hourly as a retry-safe v2 batch. Creative content and user-authored
 * metadata never enter these types.
 */
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  TelemetryAiOperation,
  TelemetryAppError,
  TelemetryAppSession,
  TelemetryBatch,
  TelemetryDiagnostics,
  TelemetryErrorProcess,
  TelemetryHourlyAiUsage,
  TelemetryHourlyUsage,
  TelemetryInstallationState,
  TelemetryProjectRemoval,
  TelemetryProjectState,
  TelemetryOsFamily,
} from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import type { ApplicationDiagnosticDraft } from '../diagnostics'
import type { ChronicleDb } from '../db/database'
import {
  getFolderTelemetryId,
  clearFolderTelemetryId,
  getSetting,
  listTrackedFolders,
  setSetting,
} from '../db/repositories'
import { sanitizeControlPlaneData } from '../gateway-client/client'

export type OsFamily = TelemetryOsFamily
export type AiOperation = TelemetryAiOperation
export type ErrorProcess = TelemetryErrorProcess
export type AppSessionRecord = TelemetryAppSession
export type ProjectRemovalRecord = TelemetryProjectRemoval
export type HourlyUsageRecord = TelemetryHourlyUsage
export type HourlyAiUsageRecord = TelemetryHourlyAiUsage
export type AppErrorRecord = TelemetryAppError
export type InstallationStateRecord = TelemetryInstallationState
export type ProjectStateRecord = TelemetryProjectState
export type { TelemetryBatch }

interface TelemetryBuffer {
  revision: number
  dirty: boolean
  sessions: AppSessionRecord[]
  projectRemovals: ProjectRemovalRecord[]
  hourlyUsage: Record<string, HourlyUsageRecord>
  hourlyAiUsage: Record<string, HourlyAiUsageRecord>
  errors: AppErrorRecord[]
  deletedProjectIds: string[]
}

const BUFFER_KEY = 'telemetry-v2-buffer'
const SNAPSHOT_HASH_KEY = 'telemetry-v2-last-snapshot-hash'
const MILESTONE_KEY = 'telemetry-product-milestones'

function emptyBuffer(): TelemetryBuffer {
  return {
    revision: 0,
    dirty: false,
    sessions: [],
    projectRemovals: [],
    hourlyUsage: {},
    hourlyAiUsage: {},
    errors: [],
    deletedProjectIds: [],
  }
}

function hourStart(date = new Date()): string {
  date.setUTCMinutes(0, 0, 0)
  return date.toISOString()
}

function recordKey(record: HourlyAiUsageRecord): string {
  return [record.bucket_start, record.operation, record.provider, record.model].join('\u001f')
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Remove common path/identity/credential shapes before an error leaves the device. */
export function sanitizeTelemetryText(value: string): string {
  const sanitized = String(sanitizeControlPlaneData(value))
    .replace(/\b[A-Z]:\\(?:[^\\\s:]+\\)*[^\\\s:]*/gi, '[path]')
    .replace(/\/(?:Users|home)\/[^/\s]+(?:\/[^\s:]*)?/g, '[path]')
    .replace(/\bhttps?:\/\/[^\s?#]+(?:\?[^\s#]*)?/gi, (url) => url.split('?')[0]!)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
  return sanitized.slice(0, 500)
}

function errorMetadata(draft: ApplicationDiagnosticDraft): {
  name: string
  code?: string
  message: string
  stack: string[]
  provider?: string
  model?: string
  operation: string
} {
  const context = recordOf(draft.context)
  const nested = recordOf(context?.['error'])
  const name = typeof nested?.['name'] === 'string' ? nested['name'] : 'Error'
  const code = typeof nested?.['code'] === 'string' ? nested['code'] : undefined
  const message = typeof nested?.['message'] === 'string' ? nested['message'] : draft.message
  const rawStack = typeof nested?.['stack'] === 'string' ? nested['stack'] : ''
  const stack = rawStack.split(/\r?\n/)
    .map(sanitizeTelemetryText)
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => line.slice(0, 240))
  return {
    name: sanitizeTelemetryText(name).slice(0, 100) || 'Error',
    ...(code ? { code: sanitizeTelemetryText(code).slice(0, 100) } : {}),
    message: sanitizeTelemetryText(message) || 'Application operation failed',
    stack,
    ...(typeof context?.['provider'] === 'string'
      ? { provider: sanitizeTelemetryText(context['provider']).slice(0, 100) } : {}),
    ...(typeof context?.['model'] === 'string'
      ? { model: sanitizeTelemetryText(context['model']).slice(0, 200) } : {}),
    operation: typeof context?.['operation'] === 'string'
      ? sanitizeTelemetryText(context['operation']).slice(0, 100)
      : draft.event.slice(0, 100),
  }
}

export interface TelemetryCollector {
  recordAppOpened(): void
  recordProjectRemoved(projectTelemetryId: string, historyDeleted: boolean): void
  recordProductActivity(activity: 'project-create' | 'version-capture' | 'restore'): void
  recordSearch(semantic?: boolean): void
  recordAiUsage(
    operation: AiOperation,
    provider: string,
    model: string,
    outcome: 'success' | 'failure',
    latencyMs: number,
  ): void
  recordDiagnostic(draft: ApplicationDiagnosticDraft, process?: ErrorProcess): void
  buildBatch(final?: boolean, forceSnapshot?: boolean): { batch: TelemetryBatch; revision: number; snapshotHash: string } | null
  commitBatch(result: { batch: TelemetryBatch; revision: number; snapshotHash: string }): void
  clear(): void
  pendingCount(): number
  diagnostics(): TelemetryDiagnostics
}

export function createTelemetryCollector(
  db: ChronicleDb,
  installationId: () => string,
  appVersion: string,
  osFamily: OsFamily,
): TelemetryCollector {
  const read = (): TelemetryBuffer => getSetting<TelemetryBuffer>(db, BUFFER_KEY) ?? emptyBuffer()
  const enabled = (): boolean =>
    getSetting<AppSettings>(db, 'app-settings')?.controlPlane.telemetryOptIn ?? true
  const write = (buffer: TelemetryBuffer): void => setSetting(db, BUFFER_KEY, buffer)
  const mutate = (fn: (buffer: TelemetryBuffer) => void): void => {
    if (!enabled()) return
    const buffer = read()
    fn(buffer)
    buffer.revision++
    buffer.dirty = true
    write(buffer)
  }

  function snapshots(): { installation: InstallationStateRecord; projects: ProjectStateRecord[] } {
    const capturedAt = new Date().toISOString()
    const settings = getSetting<AppSettings>(db, 'app-settings')
    const assets = db.prepare('SELECT id, path FROM assets').all() as Array<{ id: number; path: string }>
    const versions = db.prepare(`
      SELECT asset_id, COUNT(*) AS count FROM versions GROUP BY asset_id
    `).all() as Array<{ asset_id: number; count: number }>
    const annotated = db.prepare(`
      SELECT v.asset_id, COUNT(*) AS count
      FROM ai_annotations a JOIN versions v ON v.id = a.version_id
      GROUP BY v.asset_id
    `).all() as Array<{ asset_id: number; count: number }>
    const versionCounts = new Map(versions.map((row) => [row.asset_id, Number(row.count)]))
    const annotationCounts = new Map(annotated.map((row) => [row.asset_id, Number(row.count)]))

    const projects = listTrackedFolders(db).map((folder): ProjectStateRecord => {
      const owned = assets.filter((asset) => {
        const relative = path.relative(folder.path, asset.path)
        return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
      })
      let png = 0
      let jpg = 0
      let other = 0
      for (const asset of owned) {
        const ext = path.extname(asset.path).toLowerCase()
        if (ext === '.png') png++
        else if (ext === '.jpg' || ext === '.jpeg') jpg++
        else other++
      }
      return {
        project_telemetry_id: getFolderTelemetryId(db, folder.id),
        captured_at: capturedAt,
        asset_count: owned.length,
        version_count: owned.reduce((total, asset) => total + (versionCounts.get(asset.id) ?? 0), 0),
        ai_annotated_version_count: owned.reduce(
          (total, asset) => total + (annotationCounts.get(asset.id) ?? 0), 0,
        ),
        png_count: png,
        jpg_count: jpg,
        other_count: other,
      }
    })
    return {
      installation: {
        captured_at: capturedAt,
        project_count: projects.length,
        asset_count: projects.reduce((total, project) => total + project.asset_count, 0),
        version_count: projects.reduce((total, project) => total + project.version_count, 0),
        ai_annotated_version_count: projects.reduce(
          (total, project) => total + project.ai_annotated_version_count, 0,
        ),
        ...(settings?.ai.chat.provider ? { annotation_provider: settings.ai.chat.provider } : {}),
        ...(settings?.ai.chat.model ? { annotation_model: settings.ai.chat.model } : {}),
        ...(settings?.ai.embeddings.provider ? { embedding_provider: settings.ai.embeddings.provider } : {}),
        ...(settings?.ai.embeddings.model ? { embedding_model: settings.ai.embeddings.model } : {}),
        app_version: appVersion,
        os_family: osFamily,
        ...(getSetting<{ firstProjectAt?: string }>(db, MILESTONE_KEY)?.firstProjectAt
          ? { first_project_at: getSetting<{ firstProjectAt: string }>(db, MILESTONE_KEY)!.firstProjectAt } : {}),
        ...(getSetting<{ firstVersionAt?: string }>(db, MILESTONE_KEY)?.firstVersionAt
          ? { first_version_at: getSetting<{ firstVersionAt: string }>(db, MILESTONE_KEY)!.firstVersionAt } : {}),
      },
      projects,
    }
  }

  return {
    recordAppOpened() {
      mutate((buffer) => {
        buffer.sessions.push({
          id: randomUUID(),
          opened_at: new Date().toISOString(),
          app_version: appVersion,
          os_family: osFamily,
        })
      })
    },
    recordProjectRemoved(projectTelemetryId, historyDeleted) {
      mutate((buffer) => {
        buffer.projectRemovals.push({
          id: randomUUID(),
          project_telemetry_id: projectTelemetryId,
          occurred_at: new Date().toISOString(),
          history_deleted: historyDeleted,
        })
        if (!buffer.deletedProjectIds.includes(projectTelemetryId)) {
          buffer.deletedProjectIds.push(projectTelemetryId)
        }
      })
    },
    recordProductActivity(activity) {
      const milestones = getSetting<{ firstProjectAt?: string; firstVersionAt?: string }>(db, MILESTONE_KEY) ?? {}
      if (activity === 'project-create' && !milestones.firstProjectAt) milestones.firstProjectAt = new Date().toISOString()
      if (activity === 'version-capture' && !milestones.firstVersionAt) milestones.firstVersionAt = new Date().toISOString()
      setSetting(db, MILESTONE_KEY, milestones)
      mutate((buffer) => {
        const bucket = hourStart()
        const existing = buffer.hourlyUsage[bucket] ?? { bucket_start: bucket, search_count: 0 }
        const field = activity === 'project-create' ? 'project_create_count'
          : activity === 'version-capture' ? 'version_capture_count' : 'restore_count'
        existing[field] = (existing[field] ?? 0) + 1
        buffer.hourlyUsage[bucket] = existing
      })
    },
    recordSearch(semantic) {
      mutate((buffer) => {
        const bucket = hourStart()
        const existing = buffer.hourlyUsage[bucket] ?? { bucket_start: bucket, search_count: 0 }
        existing.search_count++
        existing.keyword_search_count = (existing.keyword_search_count ?? 0) + 1
        if (semantic) existing.semantic_search_count = (existing.semantic_search_count ?? 0) + 1
        buffer.hourlyUsage[bucket] = existing
      })
    },
    recordAiUsage(operation, provider, model, outcome, latencyMs) {
      mutate((buffer) => {
        const bucket = hourStart()
        const initial: HourlyAiUsageRecord = {
          bucket_start: bucket,
          operation,
          provider: provider.slice(0, 100),
          model: model.slice(0, 200),
          attempt_count: 0,
          success_count: 0,
          failure_count: 0,
          total_latency_ms: 0,
        }
        const key = recordKey(initial)
        const existing = buffer.hourlyAiUsage[key] ?? initial
        existing.attempt_count++
        existing[outcome === 'success' ? 'success_count' : 'failure_count']++
        existing.total_latency_ms += Math.max(0, Math.round(latencyMs))
        buffer.hourlyAiUsage[key] = existing
      })
    },
    recordDiagnostic(draft, process = 'main') {
      if (draft.level !== 'error') return
      const metadata = errorMetadata(draft)
      const fatal = ['uncaught_exception', 'render_process_gone', 'child_process_gone']
        .includes(draft.event)
      const fingerprint = createHash('sha256')
        .update([metadata.name, metadata.message, ...metadata.stack.slice(0, 5)].join('\n'))
        .digest('hex')
      mutate((buffer) => {
        buffer.errors.push({
          id: randomUUID(),
          occurred_at: draft.timestamp ?? new Date().toISOString(),
          process,
          component: draft.source.slice(0, 64),
          operation: metadata.operation || draft.event,
          error_name: metadata.name,
          ...(metadata.code ? { error_code: metadata.code } : {}),
          sanitized_message: metadata.message,
          stack_fingerprint: fingerprint,
          sanitized_stack: metadata.stack,
          severity: fatal ? 'fatal' : 'error',
          fatal,
          handled: !fatal && draft.event !== 'unhandled_rejection',
          app_version: appVersion,
          os_family: osFamily,
          ...(metadata.provider ? { provider: metadata.provider } : {}),
          ...(metadata.model ? { model: metadata.model } : {}),
        })
        if (buffer.errors.length > 1_000) buffer.errors.splice(0, buffer.errors.length - 1_000)
      })
    },
    buildBatch(final = false, forceSnapshot = false) {
      if (!enabled() && !final) return null
      const buffer = read()
      const currentSnapshots = snapshots()
      const snapshotComparable = {
        installation: { ...currentSnapshots.installation, captured_at: undefined },
        projects: currentSnapshots.projects.map(({ captured_at: _, ...project }) => project),
      }
      const snapshotHash = createHash('sha256')
        .update(JSON.stringify(snapshotComparable))
        .digest('hex')
      const previousHash = getSetting<string>(db, SNAPSHOT_HASH_KEY)
      const includeSnapshot = forceSnapshot || snapshotHash !== previousHash
      if (!final && !buffer.dirty && !includeSnapshot) return null
      return {
        revision: buffer.revision,
        snapshotHash,
        batch: {
          schema_version: 2,
          batch_id: randomUUID(),
          installation_id: installationId(),
          sent_at: new Date().toISOString(),
          final,
          sessions: buffer.sessions.slice(0, 100),
          project_removals: buffer.projectRemovals.slice(0, 100),
          hourly_usage: Object.values(buffer.hourlyUsage).slice(0, 168),
          hourly_ai_usage: Object.values(buffer.hourlyAiUsage).slice(0, 500),
          errors: buffer.errors.slice(0, 200),
          ...(includeSnapshot ? { installation_state: currentSnapshots.installation } : {}),
          projects: includeSnapshot ? currentSnapshots.projects.slice(0, 500) : [],
          deleted_project_ids: buffer.deletedProjectIds.slice(0, 100),
        },
      }
    },
    commitBatch(result) {
      const current = read()
      const sessionIds = new Set(result.batch.sessions.map((item) => item.id))
      const removalIds = new Set(result.batch.project_removals.map((item) => item.id))
      const errorIds = new Set(result.batch.errors.map((item) => item.id))
      const deletedIds = new Set(result.batch.deleted_project_ids)
      current.sessions = current.sessions.filter((item) => !sessionIds.has(item.id))
      current.projectRemovals = current.projectRemovals.filter((item) => !removalIds.has(item.id))
      current.errors = current.errors.filter((item) => !errorIds.has(item.id))
      current.deletedProjectIds = current.deletedProjectIds.filter((id) => !deletedIds.has(id))
      const currentHour = hourStart()
      for (const record of result.batch.hourly_usage) {
        if (record.bucket_start < currentHour) delete current.hourlyUsage[record.bucket_start]
      }
      for (const record of result.batch.hourly_ai_usage) {
        if (record.bucket_start < currentHour) delete current.hourlyAiUsage[recordKey(record)]
      }
      current.dirty = current.revision !== result.revision ||
        current.sessions.length > 0 || current.projectRemovals.length > 0 ||
        current.errors.length > 0 || current.deletedProjectIds.length > 0
      write(current)
      setSetting(db, SNAPSHOT_HASH_KEY, result.snapshotHash)
    },
    clear() {
      setSetting(db, BUFFER_KEY, emptyBuffer())
      setSetting(db, SNAPSHOT_HASH_KEY, '')
      for (const folder of listTrackedFolders(db)) clearFolderTelemetryId(db, folder.id)
    },
    pendingCount() {
      const batch = this.buildBatch()?.batch
      if (!batch) return 0
      return batch.sessions.length + batch.project_removals.length +
        batch.hourly_usage.length + batch.hourly_ai_usage.length + batch.errors.length +
        batch.projects.length + batch.deleted_project_ids.length +
        (batch.installation_state ? 1 : 0)
    },
    diagnostics() {
      const nextBatch = enabled() ? this.buildBatch()?.batch ?? null : null
      const counts = {
        sessions: nextBatch?.sessions.length ?? 0,
        projectRemovals: nextBatch?.project_removals.length ?? 0,
        searchHours: nextBatch?.hourly_usage.length ?? 0,
        aiUsageHours: nextBatch?.hourly_ai_usage.length ?? 0,
        errors: nextBatch?.errors.length ?? 0,
        projects: nextBatch?.projects.length ?? 0,
        deletedProjects: nextBatch?.deleted_project_ids.length ?? 0,
      }
      return {
        enabled: enabled(),
        pendingCount: Object.values(counts).reduce((total, count) => total + count, 0) +
          (nextBatch?.installation_state ? 1 : 0),
        counts,
        nextBatch,
      }
    },
  }
}
