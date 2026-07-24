import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../ipc/services'
import { DATABASE_FILE_NAME, openChronicleDb, type ChronicleDb } from '../db/database'
import { addTrackedFolder, getFolderTelemetryId, setSetting } from '../db/repositories'
import { createTelemetryCollector, sanitizeTelemetryText } from './emitter'

const INSTALLATION = '00000000-0000-0000-0000-000000000001'
let directory: string
let db: ChronicleDb

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-telemetry-'))
  db = openChronicleDb(path.join(directory, DATABASE_FILE_NAME))
  setSetting(db, 'app-settings', DEFAULT_SETTINGS)
})

afterEach(() => {
  db.close()
  fs.rmSync(directory, { recursive: true, force: true })
})

function collector() {
  return createTelemetryCollector(db, () => INSTALLATION, '0.6.0', 'windows')
}

describe('v2 usage-statistics collector', () => {
  it('builds independent sessions, hourly counters, AI usage, removals, errors, and state', () => {
    const folder = addTrackedFolder(db, path.join(directory, 'designs'))
    const projectId = getFolderTelemetryId(db, folder.id)
    const telemetry = collector()

    telemetry.recordAppOpened()
    telemetry.recordSearch()
    telemetry.recordSearch()
    telemetry.recordAiUsage('annotation', 'openai', 'gpt-5.6-terra', 'success', 1200)
    telemetry.recordAiUsage('annotation', 'openai', 'gpt-5.6-terra', 'failure', 300)
    telemetry.recordProjectRemoved(projectId, false)
    telemetry.recordDiagnostic({
      level: 'error',
      source: 'capture',
      event: 'capture_failed',
      message: 'Capture failed.',
      context: {
        operation: 'capture',
        provider: 'openai',
        model: 'gpt-5.6-terra',
        error: {
          name: 'ENOENT',
          code: 'ENOENT',
          message: `Missing ${path.join(directory, 'designs', 'secret-name.png')}`,
          stack: `ENOENT\n at ${path.join(directory, 'src', 'capture.ts')}:42`,
        },
      },
    })

    const pending = telemetry.buildBatch(false, true)
    expect(pending).not.toBeNull()
    const batch = pending!.batch
    expect(batch.schema_version).toBe(2)
    expect(batch.sessions).toHaveLength(1)
    expect(batch.hourly_usage[0]?.search_count).toBe(2)
    expect(batch.hourly_ai_usage[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      attempt_count: 2,
      success_count: 1,
      failure_count: 1,
      total_latency_ms: 1500,
    })
    expect(batch.project_removals[0]).toMatchObject({
      project_telemetry_id: projectId,
      history_deleted: false,
    })
    expect(batch.errors[0]).toMatchObject({
      process: 'main',
      component: 'capture',
      operation: 'capture',
      error_name: 'ENOENT',
      error_code: 'ENOENT',
      provider: 'openai',
      model: 'gpt-5.6-terra',
    })
    expect(JSON.stringify(batch.errors)).not.toContain('secret-name.png')
    expect(batch.installation_state).toMatchObject({
      project_count: 1,
      annotation_provider: DEFAULT_SETTINGS.ai.chat.provider,
      annotation_model: DEFAULT_SETTINGS.ai.chat.model,
    })
    expect(batch.projects[0]?.project_telemetry_id).toBe(projectId)
  })

  it('keeps current-hour counters cumulative across successful sends', () => {
    const telemetry = collector()
    telemetry.recordSearch()
    const first = telemetry.buildBatch(false, true)!
    expect(first.batch.hourly_usage[0]?.search_count).toBe(1)
    telemetry.commitBatch(first)

    telemetry.recordSearch()
    const second = telemetry.buildBatch()!
    expect(second.batch.hourly_usage[0]?.search_count).toBe(2)
  })

  it('exposes the exact pending batch without consuming it', () => {
    const telemetry = collector()
    telemetry.recordAppOpened()
    telemetry.recordSearch()

    const diagnostics = telemetry.diagnostics()
    expect(diagnostics.enabled).toBe(true)
    expect(diagnostics.pendingCount).toBeGreaterThan(0)
    expect(diagnostics.counts).toMatchObject({ sessions: 1, searchHours: 1 })
    expect(diagnostics.nextBatch).toMatchObject({
      schema_version: 2,
      installation_id: INSTALLATION,
      sessions: [{ app_version: '0.6.0' }],
      hourly_usage: [{ search_count: 1 }],
    })

    expect(telemetry.buildBatch()?.batch.sessions).toHaveLength(1)
  })

  it('shows no pending batch after unchanged data is committed', () => {
    const telemetry = collector()
    telemetry.recordSearch()
    const sent = telemetry.buildBatch(false, true)!
    telemetry.commitBatch(sent)

    const diagnostics = telemetry.diagnostics()
    expect(diagnostics.pendingCount).toBe(0)
    expect(diagnostics.nextBatch).toBeNull()
  })

  it('does not build normal batches while disabled but permits one final batch', () => {
    const telemetry = collector()
    telemetry.recordAppOpened()
    setSetting(db, 'app-settings', {
      ...DEFAULT_SETTINGS,
      controlPlane: { ...DEFAULT_SETTINGS.controlPlane, telemetryOptIn: false },
    })
    expect(telemetry.buildBatch()).toBeNull()
    expect(telemetry.buildBatch(true, true)?.batch.final).toBe(true)
    expect(telemetry.diagnostics()).toMatchObject({
      enabled: false,
      pendingCount: 0,
      nextBatch: null,
    })
  })

  it('redacts absolute paths, emails, URL queries, and credentials from error text', () => {
    const value = sanitizeTelemetryText(
      'C:\\Users\\Ada\\secret.png person@example.com https://example.test/x?token=abc sk-secret123456789',
    )
    expect(value).not.toContain('Ada')
    expect(value).not.toContain('person@example.com')
    expect(value).not.toContain('?token')
    expect(value).not.toContain('sk-secret')
  })

  it('never serializes file content, project names, paths, or search queries', () => {
    const telemetry = collector()
    telemetry.recordSearch()
    const serialized = JSON.stringify(telemetry.buildBatch(false, true)?.batch)
    for (const forbidden of [
      'query', 'file_path', 'project_name', 'description', 'content_hash',
      'summary', 'tags', 'vector',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
