import type {
  ActivityCostGroup,
  ActivityDashboard,
  ActivityDashboardDay,
  ActivityDashboardQuery,
  ActivitySavedModel,
  PersonalActivityKind,
  TelemetryAiOperation,
} from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import type { ChronicleDb } from '../db/database'
import { getSetting } from '../db/repositories'
import { estimateCost, getModelPrice, pricingCatalogStatus } from './pricing'

export interface AiCallRecord {
  operation: TelemetryAiOperation
  provider: string
  model: string
  success: boolean
  latencyMs: number
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  providerReportedUsd?: number | null
  errorCode?: string | null
  occurredAt?: string
}

export function recordPersonalActivity(
  db: ChronicleDb,
  kind: PersonalActivityKind,
  values: { occurredAt?: string; assetId?: number | null; projectId?: number | null } = {},
): void {
  db.prepare(`
    INSERT INTO personal_activity (occurred_at, kind, asset_id, project_id)
    VALUES (?, ?, ?, ?)
  `).run(
    values.occurredAt ?? new Date().toISOString(),
    kind,
    values.assetId ?? null,
    values.projectId ?? null,
  )
}

function token(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
}

export function recordAiCall(db: ChronicleDb, call: AiCallRecord): void {
  const occurredAt = call.occurredAt ?? new Date().toISOString()
  const inputTokens = token(call.inputTokens)
  const outputTokens = token(call.outputTokens)
  const totalTokens = token(call.totalTokens)
  const estimate = estimateCost(
    db,
    call.provider,
    call.model,
    call.operation,
    inputTokens,
    outputTokens,
  )
  db.prepare(`
    INSERT INTO ai_usage_calls (
      occurred_at, operation, provider, model, success, latency_ms,
      input_tokens, output_tokens, total_tokens, provider_reported_usd,
      estimated_usd, currency, price_snapshot_id, price_effective_at,
      pricing_source_url, input_usd_per_million, output_usd_per_million, error_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)
  `).run(
    occurredAt,
    call.operation,
    call.provider,
    call.model,
    call.success ? 1 : 0,
    Math.max(0, Math.round(call.latencyMs)),
    inputTokens,
    outputTokens,
    totalTokens,
    call.providerReportedUsd ?? null,
    estimate?.amountUsd ?? null,
    estimate?.snapshotId ?? null,
    estimate?.fetchedAt ?? null,
    estimate?.sourceUrl ?? null,
    estimate?.inputUsdPerMillion ?? null,
    estimate?.outputUsdPerMillion ?? null,
    call.errorCode ?? null,
  )
}

/** Fill calls captured before the first catalog refresh without repricing rows
 * that already carry an immutable snapshot. */
export function reconcileUnestimatedAiCalls(db: ChronicleDb): number {
  const rows = db.prepare(`
    SELECT id, operation, provider, model, input_tokens, output_tokens
    FROM ai_usage_calls
    WHERE success = 1 AND estimated_usd IS NULL AND input_tokens IS NOT NULL
  `).all() as Array<{
    id: number
    operation: TelemetryAiOperation
    provider: string
    model: string
    input_tokens: number
    output_tokens: number | null
  }>
  let updated = 0
  const update = db.prepare(`
    UPDATE ai_usage_calls
    SET estimated_usd = ?, price_snapshot_id = ?, price_effective_at = ?,
        pricing_source_url = ?, input_usd_per_million = ?, output_usd_per_million = ?
    WHERE id = ? AND estimated_usd IS NULL
  `)
  for (const row of rows) {
    const estimate = estimateCost(
      db,
      row.provider,
      row.model,
      row.operation,
      row.input_tokens,
      row.output_tokens,
    )
    if (!estimate) continue
    updated += update.run(
      estimate.amountUsd,
      estimate.snapshotId,
      estimate.fetchedAt,
      estimate.sourceUrl,
      estimate.inputUsdPerMillion,
      estimate.outputUsdPerMillion,
      row.id,
    ).changes
  }
  return updated
}

interface ActivityRow {
  occurred_at: string
  kind: PersonalActivityKind
  asset_id: number | null
}

interface CostRow {
  occurred_at: string
  operation: TelemetryAiOperation
  provider: string
  model: string
  success: number
  input_tokens: number | null
  output_tokens: number | null
  provider_reported_usd: number | null
  estimated_usd: number | null
  price_snapshot_id: string | null
}

function dateKey(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function emptyDay(date: string): ActivityDashboardDay & { assetIds: Set<number> } {
  return {
    date,
    versionsCaptured: 0,
    assetsActive: 0,
    aiSummaries: 0,
    searches: 0,
    restores: 0,
    total: 0,
    assetIds: new Set<number>(),
  }
}

export function getActivityDashboard(
  db: ChronicleDb,
  query: ActivityDashboardQuery,
  now = new Date(),
): ActivityDashboard {
  // Constructing the formatter is also strict validation for IANA zone names.
  new Intl.DateTimeFormat('en-US', { timeZone: query.timeZone }).format(now)
  const periodEnd = dateKey(now, query.timeZone)
  const earliest = query.rangeDays === 'all'
    ? (db.prepare(`
        SELECT MIN(occurred_at) AS occurred_at FROM (
          SELECT occurred_at FROM personal_activity
          UNION ALL
          SELECT occurred_at FROM ai_usage_calls
        )
      `).get() as { occurred_at: string | null }).occurred_at
    : null
  const periodStart = earliest
    ? dateKey(earliest, query.timeZone)
    : query.rangeDays === 'all'
      ? periodEnd
      : shiftDate(periodEnd, -(query.rangeDays - 1))
  const dayCount = Math.round(
    (Date.parse(`${periodEnd}T12:00:00.000Z`) - Date.parse(`${periodStart}T12:00:00.000Z`)) /
      86_400_000,
  ) + 1
  const days = new Map<string, ReturnType<typeof emptyDay>>()
  for (let index = 0; index < dayCount; index += 1) {
    const date = shiftDate(periodStart, index)
    days.set(date, emptyDay(date))
  }

  const activity = db.prepare(`
    SELECT occurred_at, kind, asset_id
    FROM personal_activity
    WHERE occurred_at >= ? AND occurred_at < ?
    ORDER BY occurred_at
  `).all(
    new Date(`${shiftDate(periodStart, -1)}T00:00:00.000Z`).toISOString(),
    new Date(`${shiftDate(periodEnd, 2)}T00:00:00.000Z`).toISOString(),
  ) as ActivityRow[]

  for (const row of activity) {
    const day = days.get(dateKey(row.occurred_at, query.timeZone))
    if (!day) continue
    if (row.asset_id !== null) day.assetIds.add(row.asset_id)
    if (row.kind === 'version-capture') day.versionsCaptured += 1
    else if (row.kind === 'ai-summary') day.aiSummaries += 1
    else if (row.kind === 'search') day.searches += 1
    else if (row.kind === 'restore') day.restores += 1
  }

  const costs = db.prepare(`
    SELECT occurred_at, operation, provider, model, success, input_tokens, output_tokens,
           provider_reported_usd, estimated_usd, price_snapshot_id
    FROM ai_usage_calls
    WHERE occurred_at >= ? AND occurred_at < ?
    ORDER BY occurred_at
  `).all(
    new Date(`${shiftDate(periodStart, -1)}T00:00:00.000Z`).toISOString(),
    new Date(`${shiftDate(periodEnd, 2)}T00:00:00.000Z`).toISOString(),
  ) as CostRow[]

  const groups = new Map<string, ActivityCostGroup>()
  const snapshots = new Set<string>()
  const pricingStatus = pricingCatalogStatus(db)
  let totalEstimated = 0
  let estimatedCount = 0
  let totalReported = 0
  let reportedCount = 0
  let unavailableCostCalls = 0
  for (const row of costs) {
    const day = days.get(dateKey(row.occurred_at, query.timeZone))
    if (!day) continue
    const key = [row.operation, row.provider, row.model].join('\u001f')
    const group = groups.get(key) ?? {
      operation: row.operation,
      provider: row.provider,
      model: row.model,
      calls: 0,
      successfulCalls: 0,
      inputTokens: null,
      outputTokens: null,
      providerReportedUsd: null,
      estimatedUsd: null,
      unavailableCalls: 0,
    }
    group.calls += 1
    group.successfulCalls += row.success
    if (row.input_tokens !== null) group.inputTokens = (group.inputTokens ?? 0) + row.input_tokens
    if (row.output_tokens !== null) group.outputTokens = (group.outputTokens ?? 0) + row.output_tokens
    if (row.provider_reported_usd !== null) {
      group.providerReportedUsd = (group.providerReportedUsd ?? 0) + row.provider_reported_usd
      totalReported += row.provider_reported_usd
      reportedCount += 1
    }
    if (row.estimated_usd !== null) {
      group.estimatedUsd = (group.estimatedUsd ?? 0) + row.estimated_usd
      totalEstimated += row.estimated_usd
      estimatedCount += 1
    } else {
      group.unavailableCalls += 1
      unavailableCostCalls += 1
    }
    if (row.price_snapshot_id) snapshots.add(row.price_snapshot_id)
    groups.set(key, group)
  }

  const publicDays = [...days.values()].map(({ assetIds, ...day }) => {
    day.assetsActive = assetIds.size
    day.total = day.versionsCaptured + day.aiSummaries + day.searches + day.restores
    return day
  })
  const setting = db.prepare(
    "SELECT value FROM settings WHERE key = 'personal-analytics-tracking-since'",
  ).get() as { value: string } | undefined
  let costTrackingSince = now.toISOString()
  try {
    if (setting) costTrackingSince = JSON.parse(setting.value) as string
  } catch {
    // A damaged optional setting does not make the local dashboard unusable.
  }
  const appSettings = getSetting<AppSettings>(db, 'app-settings')
  const savedModels: ActivitySavedModel[] = appSettings
    ? ([
        { task: 'chat' as const, ...appSettings.ai.chat },
        { task: 'embeddings' as const, ...appSettings.ai.embeddings },
      ])
        .filter(({ provider, model }) => provider.trim() !== '' && model.trim() !== '')
        .map(({ task, provider, model }) => ({
          task,
          provider,
          model,
          price: getModelPrice(db, provider, model),
        }))
    : []

  return {
    generatedAt: now.toISOString(),
    periodStart,
    periodEnd,
    timeZone: query.timeZone,
    costTrackingSince,
    partial: periodStart < dateKey(costTrackingSince, query.timeZone),
    totals: {
      projectsActive: Number((db.prepare('SELECT COUNT(*) AS count FROM tracked_folders').get() as { count: number }).count),
      assetsActive: Number((db.prepare('SELECT COUNT(*) AS count FROM assets').get() as { count: number }).count),
      versionsCaptured: publicDays.reduce((sum, day) => sum + day.versionsCaptured, 0),
      aiSummaries: publicDays.reduce((sum, day) => sum + day.aiSummaries, 0),
      searches: publicDays.reduce((sum, day) => sum + day.searches, 0),
      restores: publicDays.reduce((sum, day) => sum + day.restores, 0),
      aiCalls: costs.filter((row) => days.has(dateKey(row.occurred_at, query.timeZone))).length,
      estimatedUsd: estimatedCount > 0 ? totalEstimated : null,
      providerReportedUsd: reportedCount > 0 ? totalReported : null,
      unavailableCostCalls,
    },
    days: publicDays,
    savedModels,
    costGroups: [...groups.values()].sort((left, right) =>
      (right.estimatedUsd ?? -1) - (left.estimatedUsd ?? -1) ||
      right.calls - left.calls,
    ),
    pricing: {
      snapshotIds: [...snapshots],
      currency: 'USD',
      sourceUrl: pricingStatus.sourceUrl,
      refreshedAt: pricingStatus.refreshedAt,
      available: pricingStatus.available,
    },
  }
}
