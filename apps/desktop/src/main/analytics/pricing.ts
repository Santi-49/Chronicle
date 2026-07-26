/**
 * Live, single-source model pricing from Models.dev.
 *
 * The full community-maintained catalog is fetched only in the trusted main
 * process. Chronicle stores a compact cache for its direct providers so cost
 * estimation continues offline. No price is compiled into the app.
 */
import { createHash } from 'node:crypto'
import type { AiModelPrice } from '../../shared/ipc'
import type { ChronicleDb } from '../db/database'

export const PRICING_SOURCE_URL = 'https://models.dev/api.json'
const CACHE_KEY = 'models-dev-pricing-cache'
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1_000

interface RemoteModel {
  cost?: { input?: unknown; output?: unknown }
  last_updated?: unknown
}

interface RemoteProvider {
  models?: Record<string, RemoteModel>
}

interface CachedPrice {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
  sourceUpdatedAt: string | null
}

interface PricingCache {
  version: 1
  sourceUrl: string
  fetchedAt: string
  etag: string | null
  hash: string
  models: Record<string, CachedPrice>
}

const providerIds: Record<string, string> = {
  google_genai: 'google',
  openai: 'openai',
  anthropic: 'anthropic',
}

function cacheKey(provider: string, model: string): string {
  return `${provider}\u001f${model}`
}

function readCache(db: ChronicleDb): PricingCache | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(CACHE_KEY) as
    | { value: string }
    | undefined
  if (!row) return null
  try {
    const value = JSON.parse(row.value) as PricingCache
    return value.version === 1 && value.sourceUrl === PRICING_SOURCE_URL ? value : null
  } catch {
    return null
  }
}

function writeCache(db: ChronicleDb, cache: PricingCache): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(CACHE_KEY, JSON.stringify(cache))
}

function finitePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function compactCatalog(raw: string, fetchedAt: string, etag: string | null): PricingCache {
  const catalog = JSON.parse(raw) as Record<string, RemoteProvider>
  const models: Record<string, CachedPrice> = {}
  for (const [chronicleProvider, sourceProvider] of Object.entries(providerIds)) {
    for (const [modelId, model] of Object.entries(catalog[sourceProvider]?.models ?? {})) {
      const input = finitePrice(model.cost?.input)
      const output = finitePrice(model.cost?.output)
      if (input === null || output === null) continue
      models[cacheKey(chronicleProvider, modelId)] = {
        inputUsdPerMillion: input,
        outputUsdPerMillion: output,
        sourceUpdatedAt: typeof model.last_updated === 'string' ? model.last_updated : null,
      }
    }
  }
  if (Object.keys(models).length === 0) throw new Error('Models.dev returned no usable prices')
  return {
    version: 1,
    sourceUrl: PRICING_SOURCE_URL,
    fetchedAt,
    etag,
    hash: createHash('sha256').update(raw).digest('hex'),
    models,
  }
}

export async function refreshPricingCatalog(
  db: ChronicleDb,
  options: { force?: boolean; fetcher?: typeof fetch } = {},
): Promise<{ refreshed: boolean; cache: PricingCache | null }> {
  const current = readCache(db)
  if (
    !options.force &&
    current &&
    Date.now() - Date.parse(current.fetchedAt) < REFRESH_AFTER_MS
  ) {
    return { refreshed: false, cache: current }
  }
  const headers = new Headers({ 'user-agent': 'Chronicle desktop pricing catalog' })
  if (current?.etag) headers.set('if-none-match', current.etag)
  try {
    const response = await (options.fetcher ?? fetch)(PRICING_SOURCE_URL, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 304) {
      const cache = { ...current!, fetchedAt: new Date().toISOString() }
      writeCache(db, cache)
      return { refreshed: true, cache }
    }
    if (!response.ok) throw new Error(`pricing source returned HTTP ${response.status}`)
    const raw = await response.text()
    const cache = compactCatalog(raw, new Date().toISOString(), response.headers.get('etag'))
    writeCache(db, cache)
    return { refreshed: true, cache }
  } catch {
    // Pricing is non-critical. The last valid cache remains usable offline; no
    // cache means estimates stay unavailable until a later refresh succeeds.
    return { refreshed: false, cache: current }
  }
}

export interface CostEstimateResult {
  amountUsd: number
  snapshotId: string
  fetchedAt: string
  sourceUpdatedAt: string | null
  sourceUrl: string
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

export function getModelPrice(
  db: ChronicleDb,
  provider: string,
  model: string,
): AiModelPrice | null {
  const cache = readCache(db)
  const price = cache?.models[cacheKey(provider, model)]
  if (!cache || !price) return null
  return {
    provider,
    model,
    currency: 'USD',
    inputUsdPerMillion: price.inputUsdPerMillion,
    outputUsdPerMillion: price.outputUsdPerMillion,
    sourceUrl: cache.sourceUrl,
    refreshedAt: cache.fetchedAt,
    sourceUpdatedAt: price.sourceUpdatedAt,
  }
}

export function estimateCost(
  db: ChronicleDb,
  provider: string,
  model: string,
  operation: 'annotation' | 'embedding',
  inputTokens: number | null,
  outputTokens: number | null,
): CostEstimateResult | null {
  const cache = readCache(db)
  const price = cache?.models[cacheKey(provider, model)]
  if (!cache || !price || inputTokens === null ||
    (operation === 'annotation' && outputTokens === null)) return null
  return {
    amountUsd:
      inputTokens / 1_000_000 * price.inputUsdPerMillion +
      (outputTokens ?? 0) / 1_000_000 * price.outputUsdPerMillion,
    snapshotId: `models.dev:${cache.hash}`,
    fetchedAt: cache.fetchedAt,
    sourceUpdatedAt: price.sourceUpdatedAt,
    sourceUrl: cache.sourceUrl,
    inputUsdPerMillion: price.inputUsdPerMillion,
    outputUsdPerMillion: price.outputUsdPerMillion,
  }
}

export function pricingCatalogStatus(db: ChronicleDb): {
  sourceUrl: string
  refreshedAt: string | null
  available: boolean
} {
  const cache = readCache(db)
  return {
    sourceUrl: PRICING_SOURCE_URL,
    refreshedAt: cache?.fetchedAt ?? null,
    available: cache !== null,
  }
}
