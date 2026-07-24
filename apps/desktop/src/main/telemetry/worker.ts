/** Startup/hourly delivery worker for v2 usage statistics. */
import type { AppSettings } from '../../shared/settings'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'
import type { ControlPlaneClient } from '../gateway-client/client'
import type { TelemetryCollector } from './emitter'

const FLUSH_MS = 60 * 60_000

export interface TelemetryWorkerDeps {
  account: ControlPlaneClient
  collector: TelemetryCollector
  getSettings: () => Promise<AppSettings>
  isOnline: () => boolean
  diagnostic?: ApplicationDiagnosticSink
}

export interface TelemetryWorker {
  start(): void
  stop(): void
  flushNow(): Promise<void>
  /** Make one final best-effort request, then erase local telemetry state. */
  disableTelemetry(): Promise<void>
}

export function createTelemetryWorker(deps: TelemetryWorkerDeps): TelemetryWorker {
  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const diagnostic = deps.diagnostic ?? (() => {})

  async function flush(forceSnapshot = false): Promise<void> {
    if (stopped || running || !deps.isOnline()) return
    if (!(await deps.getSettings()).controlPlane.telemetryOptIn) return
    const pending = deps.collector.buildBatch(false, forceSnapshot)
    if (!pending) return
    running = true
    try {
      await deps.account.sendTelemetryBatch(pending.batch)
      deps.collector.commitBatch(pending)
      diagnostic({
        level: 'debug',
        source: 'telemetry',
        event: 'telemetry_batch_sent',
        message: 'Sent the usage-statistics batch to the control plane.',
        context: {
          batchId: pending.batch.batch_id,
          sessions: pending.batch.sessions.length,
          projectRemovals: pending.batch.project_removals.length,
          usageHours: pending.batch.hourly_usage.length,
          aiUsageHours: pending.batch.hourly_ai_usage.length,
          errors: pending.batch.errors.length,
          projects: pending.batch.projects.length,
        },
      })
    } catch (error) {
      diagnostic({
        level: 'error',
        source: 'telemetry',
        event: 'telemetry_batch_failed',
        message: 'Failed to send usage statistics; the records remain stored locally.',
        context: { error: diagnosticError(error) },
      })
    } finally {
      running = false
    }
  }

  function schedule(): void {
    if (stopped) return
    timer = setTimeout(() => {
      void flush().finally(schedule)
    }, FLUSH_MS)
    timer.unref()
  }

  return {
    start() {
      stopped = false
      void flush(true)
      schedule()
    },
    stop() {
      stopped = true
      clearTimeout(timer)
      timer = undefined
    },
    flushNow: () => flush(),
    async disableTelemetry() {
      clearTimeout(timer)
      timer = undefined
      if (deps.isOnline()) {
        const final = deps.collector.buildBatch(true, true)
        if (final) {
          try {
            await deps.account.sendTelemetryBatch(final.batch)
          } catch (error) {
            diagnostic({
              level: 'error',
              source: 'telemetry',
              event: 'telemetry_final_batch_failed',
              message: 'The final usage-statistics request failed and will not be retried.',
              context: { error: diagnosticError(error) },
            })
          }
        }
      }
      // Turning reporting off is authoritative even if the final request failed/offline.
      deps.collector.clear()
    },
  }
}
