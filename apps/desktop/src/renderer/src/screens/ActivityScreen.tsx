import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ActivityCostGroup,
  ActivityDashboard,
  ActivityDashboardDay,
  ActivityDashboardQuery,
} from '../../../shared/ipc'
import { Icon } from '../components/Icon'
import { chronicle } from '../lib/bridge'

type RangeDays = ActivityDashboardQuery['rangeDays']

const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})
const integer = new Intl.NumberFormat()

function costLabel(group: ActivityCostGroup): string {
  if (group.providerReportedUsd !== null) return money.format(group.providerReportedUsd)
  if (group.estimatedUsd !== null) return money.format(group.estimatedUsd)
  return 'Unavailable'
}

function providerLabel(provider: string): string {
  if (provider === 'google_genai') return 'Google'
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'anthropic') return 'Anthropic'
  return provider
}

function activityLabel(day: ActivityDashboardDay): string {
  const parts = [
    day.versionsCaptured ? `${day.versionsCaptured} version${day.versionsCaptured === 1 ? '' : 's'}` : '',
    day.aiSummaries ? `${day.aiSummaries} AI summar${day.aiSummaries === 1 ? 'y' : 'ies'}` : '',
    day.searches ? `${day.searches} search${day.searches === 1 ? '' : 'es'}` : '',
    day.restores ? `${day.restores} restore${day.restores === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return `${day.date}: ${parts.join(', ') || 'no activity'}`
}

function ActivityGrid({ days }: { days: ActivityDashboardDay[] }) {
  const max = Math.max(1, ...days.map((day) => day.total))
  return (
    <div
      aria-label={`Activity calendar. ${days.reduce((sum, day) => sum + day.total, 0)} actions across ${days.length} days.`}
      className="activity-calendar"
      role="img"
    >
      {days.map((day) => {
        const level = day.total === 0 ? 0 : Math.max(1, Math.ceil(day.total / max * 4))
        return (
          <span
            aria-label={activityLabel(day)}
            className={`activity-cell activity-cell-${level}`}
            key={day.date}
            role="img"
            title={activityLabel(day)}
          />
        )
      })}
    </div>
  )
}

export function ActivityScreen() {
  const [rangeDays, setRangeDays] = useState<RangeDays>(90)
  const [dashboard, setDashboard] = useState<ActivityDashboard | null>(null)
  const [online, setOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  )

  const load = useCallback(async (forcePricing = false) => {
    forcePricing ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const [next, status] = await Promise.all([
        chronicle.getActivityDashboard({ rangeDays, timeZone, refreshPricing: forcePricing }),
        chronicle.getAppStatus(),
      ])
      setDashboard(next)
      setOnline(status.online)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Activity data could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [rangeDays, timeZone])

  useEffect(() => {
    void load()
  }, [load])

  const noActivity = dashboard !== null &&
    dashboard.days.every((day) => day.total === 0) &&
    dashboard.totals.aiCalls === 0
  const dateRange = dashboard
    ? `${dashboard.periodStart} – ${dashboard.periodEnd}`
    : ''

  return (
    <div className="activity-screen">
      <header className="activity-header">
        <div>
          <p className="eyebrow">On this device</p>
          <h1>Activity &amp; Cost</h1>
          <p>See what Chronicle has captured and estimate what its AI calls cost.</p>
        </div>
        <div className="activity-header-actions">
          <div aria-label="Dashboard date range" className="range-picker" role="group">
            {([30, 90, 365, 'all'] as RangeDays[]).map((days) => (
              <button
                aria-pressed={rangeDays === days}
                className={rangeDays === days ? 'range-option range-option-active' : 'range-option'}
                key={days}
                onClick={() => setRangeDays(days)}
                type="button"
              >
                {days === 'all' ? 'All time' : days === 365 ? '1 year' : `${days} days`}
              </button>
            ))}
          </div>
          <button
            className="secondary-button activity-refresh"
            disabled={refreshing}
            onClick={() => void load(true)}
            type="button"
          >
            <Icon name="refresh" />
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
        </div>
      </header>

      {error ? (
        <section aria-live="polite" className="activity-state activity-state-error">
          <strong>Activity could not be loaded.</strong>
          <span>{error}</span>
          <button className="secondary-button" onClick={() => void load()} type="button">Try again</button>
        </section>
      ) : loading && !dashboard ? (
        <section aria-live="polite" className="activity-state">Reading private activity from this device…</section>
      ) : dashboard ? (
        <>
          <div className="activity-context">
            <span>{dateRange}</span>
            <span>{timeZone}</span>
            <span className={online ? 'status-dot-label' : 'status-dot-label status-offline'}>
              {online ? 'Online' : 'Offline · cached data'}
            </span>
          </div>

          <section aria-label="Activity overview" className="activity-kpis">
            <article className="activity-kpi activity-kpi-primary">
              <span>Estimated AI cost</span>
              <strong>{dashboard.totals.estimatedUsd === null ? 'Unavailable' : money.format(dashboard.totals.estimatedUsd)}</strong>
              <small>USD · provider invoices are authoritative</small>
            </article>
            <article className="activity-kpi">
              <span>Versions captured</span>
              <strong>{integer.format(dashboard.totals.versionsCaptured)}</strong>
              <small>{dashboard.totals.assetsActive} assets in {dashboard.totals.projectsActive} projects</small>
            </article>
            <article className="activity-kpi">
              <span>AI summaries</span>
              <strong>{integer.format(dashboard.totals.aiSummaries)}</strong>
              <small>{integer.format(dashboard.totals.aiCalls)} provider calls recorded</small>
            </article>
            <article className="activity-kpi">
              <span>Searches &amp; restores</span>
              <strong>{integer.format(dashboard.totals.searches + dashboard.totals.restores)}</strong>
              <small>{dashboard.totals.searches} searches · {dashboard.totals.restores} restores</small>
            </article>
          </section>

          <section aria-labelledby="activity-calendar-title" className="activity-panel">
            <div className="activity-section-heading">
              <div>
                <h2 id="activity-calendar-title">Daily activity</h2>
                <p>Versions, summaries, searches, and restores, without a productivity score.</p>
              </div>
              <div aria-label="Activity intensity legend" className="activity-legend">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => <i className={`activity-cell activity-cell-${level}`} key={level} />)}
                <span>More</span>
              </div>
            </div>
            <ActivityGrid days={dashboard.days} />
          </section>

          <section aria-labelledby="cost-breakdown-title" className="activity-panel">
            <div className="activity-section-heading">
              <div>
                <h2 id="cost-breakdown-title">AI cost breakdown</h2>
                <p>Provider usage or exact tokenizer counts × the cached live list price.</p>
              </div>
              <div className="pricing-source">
                <span>{dashboard.pricing.available ? 'Models.dev catalog' : 'Price catalog unavailable'}</span>
                <small>
                  {dashboard.pricing.refreshedAt
                    ? `Refreshed ${new Date(dashboard.pricing.refreshedAt).toLocaleString()}`
                    : 'Connect to refresh prices'}
                </small>
              </div>
            </div>
            {dashboard.savedModels.length > 0 && (
              <div aria-label="Saved model pricing" className="saved-model-prices">
                {dashboard.savedModels.map((saved) => (
                  <article key={`${saved.task}-${saved.provider}-${saved.model}`}>
                    <div>
                      <strong>{saved.task === 'chat' ? 'Change summaries' : 'Semantic search'}</strong>
                      <span>{providerLabel(saved.provider)} · {saved.model}</span>
                    </div>
                    <small>
                      {saved.price
                        ? `${money.format(saved.price.inputUsdPerMillion)} input${
                            saved.task === 'chat'
                              ? ` · ${money.format(saved.price.outputUsdPerMillion)} output`
                              : ''
                          } per 1M tokens`
                        : 'Live list price unavailable'}
                    </small>
                  </article>
                ))}
              </div>
            )}
            {dashboard.costGroups.length === 0 ? (
              <div className="cost-empty">
                <Icon name="spark" />
                <div><strong>No AI calls in this range</strong><span>Costs will appear after Chronicle creates a summary or semantic embedding.</span></div>
              </div>
            ) : (
              <div className="cost-table-wrap">
                <table className="cost-table">
                  <thead><tr><th>Provider &amp; model</th><th>Operation</th><th>Calls</th><th>Tokens</th><th>Amount</th><th>Basis</th></tr></thead>
                  <tbody>
                    {dashboard.costGroups.map((group) => (
                      <tr key={`${group.operation}-${group.provider}-${group.model}`}>
                        <td><strong>{providerLabel(group.provider)}</strong><span>{group.model}</span></td>
                        <td>{group.operation === 'annotation' ? 'Annotation' : 'Embedding'}</td>
                        <td>{integer.format(group.calls)}</td>
                        <td>
                          {group.inputTokens === null
                            ? 'Unavailable'
                            : `${integer.format(group.inputTokens)} in${group.outputTokens === null || group.operation === 'embedding' ? '' : ` · ${integer.format(group.outputTokens)} out`}${
                                group.unavailableCalls > 0
                                  ? ` · ${integer.format(group.unavailableCalls)} call${group.unavailableCalls === 1 ? '' : 's'} unavailable`
                                  : ''
                              }`}
                        </td>
                        <td className="cost-amount">{costLabel(group)}</td>
                        <td>
                          {group.providerReportedUsd !== null
                            ? <span className="cost-basis cost-basis-reported">Provider-reported</span>
                            : group.estimatedUsd !== null
                              ? <span className="cost-basis">
                                  Estimated{group.unavailableCalls > 0 ? ' · partial' : ''}
                                </span>
                              : <span className="cost-basis cost-basis-unavailable">Unavailable</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="pricing-footnote">
              Prices come from a live, community-maintained Models.dev catalog and are cached for offline use.
              Estimates may exclude cached tokens, tiered pricing, free quotas, taxes, and provider adjustments.
              Your provider invoice is the source of truth.
            </p>
          </section>

          {noActivity && (
            <section className="activity-state">
              <strong>Your activity will build here.</strong>
              <span>Capture a creative file, search your history, or let Chronicle create an AI summary.</span>
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
