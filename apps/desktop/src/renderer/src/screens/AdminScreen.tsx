import { useEffect, useMemo, useState } from 'react'
import type { AdminAccountSummary, AdminStatistics } from '../../../shared/ipc'
import { PageHeader } from '../components/PageHeader'
import { chronicle } from '../lib/bridge'
import world from '@svg-maps/world'

const nf = new Intl.NumberFormat()
const TRIAGE_KEY = 'chronicle-admin-error-triage'
interface TriageEntry { status?: 'acknowledged' | 'flagged'; note?: string; group?: string }

function Bars({ values }: { values: { label: string; count: number }[] }) {
  const max = Math.max(1, ...values.map((item) => item.count))
  if (!values.length) return <p className="admin-empty">No data in this period.</p>
  return <div className="admin-bars">{values.map((item) => <div key={item.label}>
    <span>{item.label}</span><i style={{ width: `${Math.max(2, item.count / max * 100)}%` }} />
    <strong>{nf.format(item.count)}</strong>
  </div>)}</div>
}

function WorldMap({ values }: { values: { label: string; count: number }[] }) {
  const counts = new Map<string, number>()
  values.forEach((item) => {
    const country = item.label.split(' · ')[0].toLowerCase()
    counts.set(country, (counts.get(country) ?? 0) + item.count)
  })
  const max = Math.max(1, ...counts.values())
  return <svg className="admin-world-map" viewBox={world.viewBox} role="img" aria-label="World map of reported sessions by country">
    {world.locations.map((country) => {
      const count = counts.get(country.id) ?? 0
      return <path key={country.id} d={country.path} data-active={count > 0}
        style={{ opacity: count ? .3 + .7 * count / max : 1 }}>
        <title>{country.name}: {count} reported sessions</title>
      </path>
    })}
  </svg>
}

export function AdminScreen() {
  const [days, setDays] = useState(30)
  const [account, setAccount] = useState<AdminAccountSummary | null>(null)
  const [country, setCountry] = useState('')
  const [osFamily, setOsFamily] = useState('')
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([])
  const [data, setData] = useState<AdminStatistics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [triage, setTriage] = useState<Record<string, TriageEntry>>(
    () => JSON.parse(localStorage.getItem(TRIAGE_KEY) ?? '{}') as Record<string, TriageEntry>,
  )

  const load = async () => {
    setLoading(true); setError('')
    try { setData(await chronicle.getAdminStatistics(days, account?.id, country || undefined, osFamily || undefined)) }
    catch { setError('The product analytics service could not be reached. Check your admin session and retry.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [days, account?.id, country, osFamily])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void chronicle.searchAdminAccounts(query).then(setAccounts).catch(() => setAccounts([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const setErrorState = (fingerprint: string, state: 'acknowledged' | 'flagged' | null) => {
    const next = { ...triage }
    if (state) next[fingerprint] = { ...next[fingerprint], status: state }
    else delete next[fingerprint]
    setTriage(next); localStorage.setItem(TRIAGE_KEY, JSON.stringify(next))
  }
  const updateTriageText = (fingerprint: string, patch: Partial<TriageEntry>) => {
    const next = { ...triage, [fingerprint]: { ...triage[fingerprint], ...patch } }
    setTriage(next); localStorage.setItem(TRIAGE_KEY, JSON.stringify(next))
  }
  const kpis = useMemo(() => data ? [
    ['Total users', data.overview.registered_accounts],
    ['Weekly creative installations', data.overview.weekly_active_creative_installations],
    ['Active installations', data.overview.estimated_active_installations],
    ['Projects created', data.overview.project_creations],
    ['Versions captured', data.overview.versions_captured],
    ['Median versions per project', data.inventory_averages.median_versions_per_project],
    ['Activation within 24h', `${Math.round(data.overview.activation_rate * 100)}%`],
    ['D7 retention', `${Math.round(data.overview.d7_retention_rate * 100)}%`],
    ['AI success', `${Math.round(data.ai.success_rate * 100)}%`],
    ['Searches', data.search.total_count],
  ] : [], [data])

  return <section className="page admin-page" aria-labelledby="admin-title">
    <PageHeader eyebrow="Product analytics" title="Chronicle success dashboard"
      description="Understand adoption, engagement, reliability, and where the product needs improvement." />
    <div className="admin-filters">
      <label><span>Period</span><select value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
      </select></label>
      <label><span>Country code</span><input maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="All countries" /></label>
      <label><span>Operating system</span><select value={osFamily} onChange={(e) => setOsFamily(e.target.value)}>
        <option value="">All operating systems</option><option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option><option value="other">Other</option>
      </select></label>
      <label className="admin-account-filter"><span>Google account or user</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search email or name" />
        {query && <div className="admin-account-results">{accounts.map((item) =>
          <button key={item.id} type="button" onClick={() => { setAccount(item); setQuery('') }}>
            <strong>{item.email}</strong><small>{item.google_linked ? 'Google account' : 'Password account'} · {item.installation_count} installations</small>
          </button>)}</div>}
      </label>
      {account && <button className="secondary-button" type="button" onClick={() => setAccount(null)}>Clear {account.email}</button>}
    </div>
    {loading && <p className="admin-state" role="status">Loading live product analytics…</p>}
    {error && <div className="admin-state" role="alert">{error} <button onClick={() => void load()} type="button">Retry</button></div>}
    {data && !loading && <>
      {account && <article className="admin-user-overview">
        <div><span>Selected user</span><strong>{account.email}</strong><small>{account.display_name} · {account.google_linked ? 'Google-linked account' : 'Chronicle account'}</small></div>
        <div><span>Installations</span><strong>{account.installation_count}</strong></div>
        <div><span>Current projects</span><strong>{account.current_project_count}</strong></div>
        <div><span>Current versions</span><strong>{account.current_version_count}</strong></div>
      </article>}
      <div className="admin-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{typeof value === 'number' ? nf.format(value) : value}</strong></article>)}</div>
      <div className="admin-grid">
        <article className="admin-panel"><h2>Search activity</h2><p>Daily searches in the selected period.</p>
          <Bars values={data.search.over_time.map((p) => ({ label: new Date(p.bucket_start).toLocaleDateString(), count: p.count }))} />
        </article>
        <article className="admin-panel"><h2>AI calls</h2><p>Annotation and embedding attempts.</p>
          <Bars values={data.ai.over_time.map((p) => ({ label: new Date(p.bucket_start).toLocaleDateString(), count: p.count }))} />
        </article>
        <article className="admin-panel"><h2>File types</h2><p>Current content-free inventory.</p><Bars values={data.file_type_distribution} /></article>
        <article className="admin-panel admin-map"><h2>Country map</h2><p>Coarse session geography; no IP addresses are retained.</p>
          <WorldMap values={data.coarse_locations} />
          <Bars values={data.coarse_locations} />
        </article>
      </div>
      <article className="admin-panel admin-errors"><h2>Reliability and grouped errors</h2>
        <p>Grouped by sanitized stack fingerprint. Triage state is stored only on this device.</p>
        {!data.errors.length ? <p className="admin-empty">No errors reported in this period.</p> :
          data.errors.map((item) => <div className="admin-error-row" key={item.stack_fingerprint}>
            <div><strong>{item.component} · {item.error_name}</strong><small>{item.count} occurrences · last seen {new Date(item.last_seen_at).toLocaleString()}</small></div>
            <code>{item.stack_fingerprint.slice(0, 12)}</code>
            <button className={triage[item.stack_fingerprint]?.status === 'acknowledged' ? 'active' : ''} onClick={() => setErrorState(item.stack_fingerprint, 'acknowledged')} type="button">Acknowledge</button>
            <button className={triage[item.stack_fingerprint]?.status === 'flagged' ? 'active' : ''} onClick={() => setErrorState(item.stack_fingerprint, 'flagged')} type="button">Flag</button>
            {triage[item.stack_fingerprint] && <button onClick={() => setErrorState(item.stack_fingerprint, null)} type="button">Clear</button>}
            <input aria-label={`Local group for ${item.error_name}`} placeholder="Local group"
              value={triage[item.stack_fingerprint]?.group ?? ''} onChange={(e) => updateTriageText(item.stack_fingerprint, { group: e.target.value })} />
            <input aria-label={`Local note for ${item.error_name}`} placeholder="Private note"
              value={triage[item.stack_fingerprint]?.note ?? ''} onChange={(e) => updateTriageText(item.stack_fingerprint, { note: e.target.value })} />
          </div>)}
      </article>
      {(!data.ai.token_counts_available || !data.search.mode_counts_available) &&
        <p className="admin-disclosure">Token totals and keyword-versus-semantic search counts are not collected by the current privacy-safe telemetry contract.</p>}
    </>}
  </section>
}
