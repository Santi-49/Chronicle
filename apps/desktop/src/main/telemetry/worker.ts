/**
 * POST-04 — offline-capable telemetry flush worker (F8).
 *
 * Two responsibilities:
 *   1. Drain `job_type = 'telemetry'` queue rows in batches → POST /telemetry/events
 *   2. Sync per-project file-count inventory → PUT /telemetry/projects/{id}
 *
 * Both are best-effort: failures are silent and retry on the next poll.
 * The product is fully usable while this worker never runs.
 */
import type { AppSettings } from '../../shared/settings'
import type { ControlPlaneClient } from '../gateway-client/client'
import type { ChronicleDb } from '../db/database'
import {
  clearFolderTelemetryId,
  clearTelemetryQueue,
  deleteJob,
  getFolderTelemetryId,
  listJobs,
  listTrackedFolders,
} from '../db/repositories'
import { buildProjectInventory, type TelemetryPayload } from './emitter'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'

const BATCH_SIZE = 50
const EVENT_POLL_MS = 30_000   // 30 s
const INVENTORY_POLL_MS = 5 * 60_000  // 5 min

export interface TelemetryWorkerDeps {
  db: ChronicleDb
  account: ControlPlaneClient
  getSettings: () => Promise<AppSettings>
  isOnline: () => boolean
  installationId: () => string
  /** Return the extensions of all captured files for a folder (from the DB). */
  getFolderFileExts: (folderId: number) => string[]
  diagnostic?: ApplicationDiagnosticSink
}

export interface TelemetryWorker {
  start(): void
  stop(): void
  /** Trigger an immediate inventory flush — call after folder add/remove. */
  syncInventory(): void
  /** Clear local queue and delete server inventory — call when user disables telemetry. */
  disableTelemetry(): Promise<void>
}

export function createTelemetryWorker(deps: TelemetryWorkerDeps): TelemetryWorker {
  let stopped = false
  let eventTimer: ReturnType<typeof setTimeout> | undefined
  let inventoryTimer: ReturnType<typeof setTimeout> | undefined
  const diagnostic: ApplicationDiagnosticSink = deps.diagnostic ?? (() => {})

  async function enabled(): Promise<boolean> {
    return (await deps.getSettings()).controlPlane.telemetryOptIn
  }

  async function flushEvents(): Promise<void> {
    if (stopped || !deps.isOnline() || !(await enabled())) return
    const jobs = listJobs(deps.db, 'telemetry')
    if (jobs.length === 0) return
    const batch = jobs.slice(0, BATCH_SIZE)
    const events = batch
      .map((j) => j.payload as TelemetryPayload | null)
      .filter((p): p is TelemetryPayload => p !== null)
    try {
      if (events.length > 0) await deps.account.sendTelemetryBatch(events)
      for (const j of batch) deleteJob(deps.db, j.id)
      diagnostic({
        level: 'debug',
        source: 'telemetry',
        event: 'telemetry_batch_sent',
        message: `Sent ${events.length} telemetry event${events.length === 1 ? '' : 's'} to the control plane.`,
        context: { queueIds: batch.map((job) => job.id), events },
      })
    } catch (error) {
      diagnostic({
        level: 'error',
        source: 'telemetry',
        event: 'telemetry_batch_failed',
        message: `Failed to send ${events.length} telemetry event${events.length === 1 ? '' : 's'}; they remain queued.`,
        context: {
          queueIds: batch.map((job) => job.id),
          events,
          error: diagnosticError(error),
        },
      })
      /* retry on next poll */
    }
  }

  async function flushInventory(): Promise<void> {
    if (stopped || !deps.isOnline() || !(await enabled())) return
    const installationId = deps.installationId()
    for (const folder of listTrackedFolders(deps.db)) {
      const telemetryId = getFolderTelemetryId(deps.db, folder.id)
      const exts = deps.getFolderFileExts(folder.id)
      const inventory = buildProjectInventory(exts.map((ext) => ({ ext })))
      try {
        await deps.account.upsertProjectInventory(telemetryId, installationId, inventory)
        diagnostic({
          level: 'debug',
          source: 'telemetry',
          event: 'project_inventory_sent',
          message: `Sent inventory for project ${folder.displayName}.`,
          context: { projectId: folder.id, projectTelemetryId: telemetryId, inventory },
        })
      } catch (error) {
        diagnostic({
          level: 'error',
          source: 'telemetry',
          event: 'project_inventory_failed',
          message: `Failed to send inventory for project ${folder.displayName}.`,
          context: {
            projectId: folder.id,
            projectTelemetryId: telemetryId,
            inventory,
            error: diagnosticError(error),
          },
        })
        /* retry on next poll */
      }
    }
  }

  function scheduleEvents(): void {
    if (stopped) return
    void flushEvents()
    eventTimer = setTimeout(scheduleEvents, EVENT_POLL_MS)
    eventTimer.unref()
  }

  function scheduleInventory(): void {
    if (stopped) return
    void flushInventory()
    inventoryTimer = setTimeout(scheduleInventory, INVENTORY_POLL_MS)
    inventoryTimer.unref()
  }

  return {
    start() {
      stopped = false
      scheduleEvents()
      scheduleInventory()
    },
    stop() {
      stopped = true
      clearTimeout(eventTimer)
      clearTimeout(inventoryTimer)
      eventTimer = undefined
      inventoryTimer = undefined
    },
    syncInventory() {
      void flushInventory()
    },
    async disableTelemetry() {
      clearTelemetryQueue(deps.db)
      if (!deps.isOnline()) return
      const installationId = deps.installationId()
      for (const folder of listTrackedFolders(deps.db)) {
        const row = deps.db
          .prepare('SELECT telemetry_id FROM tracked_folders WHERE id = ?')
          .get(folder.id) as { telemetry_id: string | null } | undefined
        if (!row?.telemetry_id) continue
        try {
          await deps.account.deleteProjectInventory(row.telemetry_id, installationId)
        } catch (error) {
          diagnostic({
            level: 'error',
            source: 'telemetry',
            event: 'project_inventory_delete_failed',
            message: `Failed to delete server inventory for project ${folder.displayName}.`,
            context: {
              projectId: folder.id,
              projectTelemetryId: row.telemetry_id,
              error: diagnosticError(error),
            },
          })
          /* best-effort */
        }
        clearFolderTelemetryId(deps.db, folder.id)
      }
    },
  }
}
