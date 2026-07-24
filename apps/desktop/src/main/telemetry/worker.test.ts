import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../shared/settings'
import { DEFAULT_SETTINGS } from '../ipc/services'
import type { ControlPlaneClient } from '../gateway-client/client'
import type { TelemetryBatch, TelemetryCollector } from './emitter'
import { createTelemetryWorker } from './worker'

function batch(final = false): TelemetryBatch {
  return {
    schema_version: 2,
    batch_id: crypto.randomUUID(),
    installation_id: '00000000-0000-0000-0000-000000000001',
    sent_at: new Date().toISOString(),
    final,
    sessions: [],
    project_removals: [],
    hourly_usage: [{ bucket_start: '2026-07-24T10:00:00.000Z', search_count: 1 }],
    hourly_ai_usage: [],
    errors: [],
    projects: [],
    deleted_project_ids: [],
  }
}

function setup(online = true) {
  const sendTelemetryBatch = vi.fn().mockResolvedValue(undefined)
  const commitBatch = vi.fn()
  const clear = vi.fn()
  const buildBatch = vi.fn((final = false) => ({
    batch: batch(final),
    revision: 1,
    snapshotHash: 'snapshot',
  }))
  const collector = {
    buildBatch,
    commitBatch,
    clear,
  } as unknown as TelemetryCollector
  const worker = createTelemetryWorker({
    account: { sendTelemetryBatch } as unknown as ControlPlaneClient,
    collector,
    getSettings: async (): Promise<AppSettings> => DEFAULT_SETTINGS,
    isOnline: () => online,
  })
  return { worker, sendTelemetryBatch, buildBatch, commitBatch, clear }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('usage-statistics delivery cadence', () => {
  it('sends on startup and no more than once per hour', async () => {
    vi.useFakeTimers()
    const { worker, sendTelemetryBatch } = setup()
    worker.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(sendTelemetryBatch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60 * 60_000 - 1)
    expect(sendTelemetryBatch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sendTelemetryBatch).toHaveBeenCalledTimes(2)
    worker.stop()
  })

  it('sends one final batch and clears local state when reporting is disabled', async () => {
    const { worker, sendTelemetryBatch, buildBatch, clear } = setup()
    await worker.disableTelemetry()
    expect(buildBatch).toHaveBeenCalledWith(true, true)
    expect(sendTelemetryBatch).toHaveBeenCalledTimes(1)
    expect(sendTelemetryBatch.mock.calls[0]?.[0]).toMatchObject({ final: true })
    expect(clear).toHaveBeenCalledOnce()
  })

  it('clears without sending or retrying when opt-out happens offline', async () => {
    const { worker, sendTelemetryBatch, clear } = setup(false)
    await worker.disableTelemetry()
    expect(sendTelemetryBatch).not.toHaveBeenCalled()
    expect(clear).toHaveBeenCalledOnce()
  })
})
