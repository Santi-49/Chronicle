import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openChronicleDb, type ChronicleDb } from '../db/database'
import {
  getActivityDashboard,
  recordAiCall,
  recordPersonalActivity,
  reconcileUnestimatedAiCalls,
} from './repository'
import { getModelPrice, refreshPricingCatalog } from './pricing'

let root: string
let db: ChronicleDb

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-activity-'))
  db = openChronicleDb(path.join(root, 'chronicle.db'))
})

afterEach(() => {
  db.close()
  fs.rmSync(root, { recursive: true, force: true })
})

function catalog(input = 2, output = 4): string {
  return JSON.stringify({
    google: {
      models: {
        'live-test-model': {
          last_updated: '2026-07-26',
          cost: { input, output },
        },
      },
    },
    openai: { models: {} },
    anthropic: { models: {} },
  })
}

function fetcher(body: string): typeof fetch {
  return async () => new Response(body, {
    status: 200,
    headers: { etag: '"catalog-revision"' },
  })
}

describe('live pricing snapshots', () => {
  it('fetches one catalog, persists its exact rates, and never guesses an unknown model', async () => {
    await refreshPricingCatalog(db, { force: true, fetcher: fetcher(catalog()) })
    expect(getModelPrice(db, 'google_genai', 'live-test-model')).toMatchObject({
      provider: 'google_genai',
      model: 'live-test-model',
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 4,
      currency: 'USD',
    })
    recordAiCall(db, {
      operation: 'annotation',
      provider: 'google_genai',
      model: 'live-test-model',
      success: true,
      latencyMs: 120,
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    })
    recordAiCall(db, {
      operation: 'embedding',
      provider: 'google_genai',
      model: 'not-in-catalog',
      success: true,
      latencyMs: 20,
      inputTokens: 50,
    })

    const rows = db.prepare(`
      SELECT model, estimated_usd, price_snapshot_id, input_usd_per_million,
             output_usd_per_million
      FROM ai_usage_calls ORDER BY id
    `).all() as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({
      model: 'live-test-model',
      estimated_usd: 4,
      input_usd_per_million: 2,
      output_usd_per_million: 4,
    })
    expect(rows[0]?.price_snapshot_id).toMatch(/^models\.dev:[a-f0-9]{64}$/)
    expect(rows[1]).toMatchObject({
      model: 'not-in-catalog',
      estimated_usd: null,
      price_snapshot_id: null,
    })
  })

  it('reconciles a pre-refresh call once and keeps that historical estimate immutable', async () => {
    recordAiCall(db, {
      operation: 'embedding',
      provider: 'google_genai',
      model: 'live-test-model',
      success: true,
      latencyMs: 20,
      inputTokens: 1_000_000,
    })
    await refreshPricingCatalog(db, { force: true, fetcher: fetcher(catalog(2, 0)) })
    expect(reconcileUnestimatedAiCalls(db)).toBe(1)
    await refreshPricingCatalog(db, { force: true, fetcher: fetcher(catalog(9, 0)) })
    expect(reconcileUnestimatedAiCalls(db)).toBe(0)
    expect((db.prepare('SELECT estimated_usd FROM ai_usage_calls').get() as { estimated_usd: number }).estimated_usd).toBe(2)
  })
})

describe('personal activity dashboard', () => {
  it('groups activity in the requested timezone and exposes partial cost coverage', () => {
    recordPersonalActivity(db, 'version-capture', {
      occurredAt: '2026-07-25T22:30:00.000Z',
      assetId: 7,
    })
    recordPersonalActivity(db, 'search', {
      occurredAt: '2026-07-26T08:00:00.000Z',
    })
    const result = getActivityDashboard(
      db,
      { rangeDays: 30, timeZone: 'Europe/Madrid' },
      new Date('2026-07-26T12:00:00.000Z'),
    )
    const today = result.days.find((day) => day.date === '2026-07-26')
    expect(today).toMatchObject({
      versionsCaptured: 1,
      assetsActive: 1,
      searches: 1,
      total: 2,
    })
    expect(result.timeZone).toBe('Europe/Madrid')
    expect(result.partial).toBe(true)
  })

  it('starts an all-time range on the first local record', () => {
    recordPersonalActivity(db, 'search', {
      occurredAt: '2024-01-03T08:00:00.000Z',
    })
    const result = getActivityDashboard(
      db,
      { rangeDays: 'all', timeZone: 'UTC' },
      new Date('2026-07-26T12:00:00.000Z'),
    )
    expect(result.periodStart).toBe('2024-01-03')
    expect(result.periodEnd).toBe('2026-07-26')
    expect(result.days[0]?.searches).toBe(1)
    expect(result.days).toHaveLength(936)
  })
})
