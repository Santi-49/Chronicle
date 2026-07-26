import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import world from '@svg-maps/world'
import type {
  AdminAccountSummary,
  AdminCategoryCount,
  AdminStatistics,
  AdminStatisticsFilters,
  AdminTimeSeriesPoint,
} from '../../../shared/ipc'
import { PageHeader } from '../components/PageHeader'
import { chronicle } from '../lib/bridge'
import { releaseAdoption } from './releaseAdoption'

const nf = new Intl.NumberFormat()
const pf = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
const TRIAGE_KEY = 'chronicle-admin-error-triage'
type View = 'overview' | 'product' | 'audience' | 'reliability' | 'users'
interface TriageEntry { status?: 'acknowledged' | 'flagged'; note?: string; group?: string }

const views: Array<{ id: View; label: string; question: string }> = [
  { id: 'overview', label: 'Overview', question: 'Is Chronicle succeeding?' },
  { id: 'product', label: 'Product', question: 'Are people reaching and repeating value?' },
  { id: 'audience', label: 'Audience & releases', question: 'Who uses Chronicle and what are they running?' },
  { id: 'reliability', label: 'Reliability', question: 'What should we fix next?' },
  { id: 'users', label: 'Users & access', question: 'Who is registered and who can administer?' },
]

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Bars({ values, suffix = '' }: { values: AdminCategoryCount[]; suffix?: string }) {
  const max = Math.max(1, ...values.map((item) => item.count))
  if (!values.length) return <p className="admin-empty">No data in this period.</p>
  return <div className="admin-bars">{values.map((item) => <div key={item.label}
    title={`${item.label}: ${nf.format(item.count)}${suffix}`} tabIndex={0}>
    <span title={item.label}>{item.label}</span>
    <span className="admin-bar-track"><i style={{ width: `${Math.max(2, item.count / max * 100)}%` }} /></span>
    <strong>{nf.format(item.count)}{suffix}</strong>
  </div>)}</div>
}

function TrendPlot({ values, label }: { values: AdminTimeSeriesPoint[]; label: string }) {
  const gradientId = useId()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  if (!values.length) return <p className="admin-empty">No data in this period.</p>
  const width = 640
  const height = 180
  const maximum = Math.max(1, ...values.map((point) => point.count))
  const points = values.map((point, index) => {
    const x = values.length === 1 ? width / 2 : index / (values.length - 1) * width
    const y = height - point.count / maximum * (height - 18)
    return { ...point, x, y }
  })
  const active = activeIndex === null ? null : points[activeIndex]
  return <div className="admin-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${label}. Latest value ${values.at(-1)?.count ?? 0}.`}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity=".3" />
        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
      </linearGradient></defs>
      <path className="admin-trend-area"
        style={{ fill: `url(#${gradientId})` }}
        d={`M 0 ${height} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${width} ${height} Z`} />
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
      {points.map((point, index) => <circle key={point.bucket_start} cx={point.x} cy={point.y}
        r={activeIndex === index ? 6 : 4} tabIndex={0}
        onMouseEnter={() => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)}
        aria-label={`${dateLabel(point.bucket_start)}: ${point.count}`}>
        <title>{dateLabel(point.bucket_start)}: {nf.format(point.count)}</title>
      </circle>)}
    </svg>
    {active && <div className="admin-chart-tooltip" role="status"
      style={{ left: `${active.x / width * 100}%`, top: `${active.y / height * 100}%` }}>
      <strong>{nf.format(active.count)}</strong><span>{dateLabel(active.bucket_start)}</span>
    </div>}
    <div className="admin-trend-axis"><span>{dateLabel(values[0].bucket_start)}</span>
      <span>{dateLabel(values.at(-1)!.bucket_start)}</span></div>
    <details className="admin-chart-data"><summary>View chart data</summary>
      <table><thead><tr><th>Date</th><th>Value</th></tr></thead><tbody>
        {values.map((point) => <tr key={point.bucket_start}><td>{dateLabel(point.bucket_start)}</td>
          <td>{nf.format(point.count)}</td></tr>)}
      </tbody></table>
    </details>
  </div>
}

function WorldMap({ values }: { values: AdminCategoryCount[] }) {
  const [zoom, setZoom] = useState(1)
  const frameRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{
    pointerX: number; pointerY: number; scrollLeft: number; scrollTop: number
  } | null>(null)
  const counts = new Map<string, number>()
  values.forEach((item) => {
    const country = item.label.split(' · ')[0].toLowerCase()
    counts.set(country, (counts.get(country) ?? 0) + item.count)
  })
  const max = Math.max(1, ...counts.values())
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const frame = frameRef.current
    if (!frame) return
    const next = Math.min(4, Math.max(1, zoom + (event.deltaY < 0 ? .25 : -.25)))
    if (next === zoom) return
    const bounds = frame.getBoundingClientRect()
    const pointerX = event.clientX - bounds.left
    const pointerY = event.clientY - bounds.top
    const contentX = (frame.scrollLeft + pointerX) / zoom
    const contentY = (frame.scrollTop + pointerY) / zoom
    setZoom(next)
    window.requestAnimationFrame(() => {
      frame.scrollLeft = contentX * next - pointerX
      frame.scrollTop = contentY * next - pointerY
    })
  }
  const startDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || event.button !== 0) return
    event.preventDefault()
    const frame = frameRef.current
    if (!frame) return
    setDrag({
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: frame.scrollLeft,
      scrollTop: frame.scrollTop,
    })
  }
  const moveDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!drag) return
    event.preventDefault()
    const frame = frameRef.current
    if (!frame) return
    frame.scrollLeft = drag.scrollLeft - (event.clientX - drag.pointerX)
    frame.scrollTop = drag.scrollTop - (event.clientY - drag.pointerY)
  }
  return <div className="admin-map">
    <p className="admin-map-hint">Ctrl + scroll to zoom · Ctrl + drag to pan · {Math.round(zoom * 100)}%</p>
    <div ref={frameRef}
      className={`admin-map-frame${zoom > 1 ? ' zoomed' : ''}${drag ? ' dragging' : ''}`} tabIndex={0}
      onWheel={handleWheel} onMouseDown={startDrag} onMouseMove={moveDrag}
      onMouseUp={() => setDrag(null)} onMouseLeave={() => setDrag(null)}
      aria-label="Interactive world map. Hold Control and scroll to zoom. Hold Control and drag to pan.">
      <svg className="admin-world-map" viewBox={world.viewBox} role="img"
        style={{ width: `${zoom * 100}%` }}
        aria-label="Reported sessions by country. A ranked table follows the map.">
        {world.locations.map((country) => {
          const count = counts.get(country.id) ?? 0
          return <path key={country.id} d={country.path} data-active={count > 0}
            style={{ opacity: count ? .3 + .7 * count / max : 1 }}>
            <title>{country.name}: {count} reported sessions</title>
          </path>
        })}
      </svg>
    </div>
  </div>
}

function MetricCards({ metrics }: { metrics: Array<[string, string | number, string?]> }) {
  return <div className="admin-kpis">{metrics.map(([label, value, note]) => <article key={label}>
    <span>{label}</span><strong>{typeof value === 'number' ? nf.format(value) : value}</strong>
    {note && <small>{note}</small>}
  </article>)}</div>
}

function Filters({
  range, setRange, startDate, setStartDate, endDate, setEndDate,
  account, setAccount, country, setCountry, osFamily, setOsFamily,
  appVersion, setAppVersion, appVersions,
}: {
  range: string; setRange: (value: string) => void
  startDate: string; setStartDate: (value: string) => void
  endDate: string; setEndDate: (value: string) => void
  account: AdminAccountSummary | null; setAccount: (value: AdminAccountSummary | null) => void
  country: string; setCountry: (value: string) => void
  osFamily: string; setOsFamily: (value: string) => void
  appVersion: string; setAppVersion: (value: string) => void
  appVersions: AdminCategoryCount[]
}) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!query.trim()) return setAccounts([])
      void chronicle.searchAdminAccounts(query).then(setAccounts).catch(() => setAccounts([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])
  return <div className="admin-filters" aria-label="Analytics filters">
    <label><span>Period</span><select value={range} onChange={(event) => setRange(event.target.value)}>
      <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
      <option value="90">Last 90 days</option><option value="all">All time</option>
      <option value="custom">Custom range</option>
    </select></label>
    {range === 'custom' && <>
      <label><span>Start date</span><input type="date" value={startDate}
        onChange={(event) => setStartDate(event.target.value)} /></label>
      <label><span>End date</span><input type="date" min={startDate} value={endDate}
        onChange={(event) => setEndDate(event.target.value)} /></label>
    </>}
    <label><span>Country</span><input maxLength={2} value={country}
      onChange={(event) => setCountry(event.target.value.toUpperCase())} placeholder="All countries" /></label>
    <label><span>Operating system</span><select value={osFamily}
      onChange={(event) => setOsFamily(event.target.value)}>
      <option value="">All operating systems</option><option value="windows">Windows</option>
      <option value="macos">macOS</option><option value="linux">Linux</option><option value="other">Other</option>
    </select></label>
    <label><span>App version</span><input list="admin-app-versions" value={appVersion}
      onChange={(event) => setAppVersion(event.target.value)} placeholder="All versions" />
      <datalist id="admin-app-versions">{appVersions.map((item) =>
        <option value={item.label} key={item.label} />)}</datalist>
    </label>
    <label className="admin-account-filter"><span>Account</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Search Google email or name" />
      {!!accounts.length && <div className="admin-account-results">{accounts.map((item) =>
        <button key={item.id} type="button" onClick={() => { setAccount(item); setQuery(''); setAccounts([]) }}>
          <strong>{item.email}</strong><small>{item.google_linked ? 'Google-linked' : 'Chronicle account'}
            {' · '}{item.installation_count} installations</small>
        </button>)}</div>}
    </label>
    <div className="admin-filter-chips" aria-label="Applied filters">
      {account && <button type="button" onClick={() => setAccount(null)}>Account: {account.email} ×</button>}
      {country && <button type="button" onClick={() => setCountry('')}>Country: {country} ×</button>}
      {osFamily && <button type="button" onClick={() => setOsFamily('')}>OS: {osFamily} ×</button>}
      {appVersion && <button type="button" onClick={() => setAppVersion('')}>Version: {appVersion} ×</button>}
    </div>
  </div>
}

function Overview({ data, onView }: { data: AdminStatistics; onView: (view: View) => void }) {
  const affectedRate = data.overview.estimated_active_installations
    ? data.overview.error_affected_installations / data.overview.estimated_active_installations : 0
  return <>
    <MetricCards metrics={[
      ['Active installations', data.overview.estimated_active_installations, 'Unique reporting profiles'],
      ['New installations', data.overview.new_installations, 'First seen in this period'],
      ['Activated in 24h', pf.format(data.overview.activation_rate),
        `${nf.format(data.overview.activation_eligible_installations)} eligible installations`],
      ['D7 retention', pf.format(data.overview.d7_retention_rate),
        `${nf.format(data.overview.d7_eligible_installations)} eligible installations`],
      ['Weekly creative active', data.overview.weekly_active_creative_installations, 'Captured a version'],
      ['Affected by errors', pf.format(affectedRate),
        `${nf.format(data.overview.error_affected_installations)} installations`],
    ]} />
    <div className="admin-grid">
      <article className="admin-panel admin-panel-wide"><h2>Active installation trend</h2>
        <p>Daily and seven-day active installation counts.</p>
        <TrendPlot values={data.growth.daily_active_installations} label="Daily active installations" />
      </article>
      <article className="admin-panel"><h2>Needs attention</h2>
        <p>Signals worth inspecting next.</p>
        <div className="admin-attention">
          <button type="button" onClick={() => onView('reliability')}>
            <strong>{data.errors.length} grouped issues</strong><span>Inspect reliability →</span>
          </button>
          <button type="button" onClick={() => onView('audience')}>
            <strong>{data.app_version_distribution.length} active releases</strong><span>Compare adoption →</span>
          </button>
          <button type="button" onClick={() => onView('product')}>
            <strong>{pf.format(data.ai.success_rate)} AI success</strong><span>Inspect product usage →</span>
          </button>
        </div>
      </article>
    </div>
  </>
}

function Product({ data }: { data: AdminStatistics }) {
  const annotations = data.ai.provider_model_mix.filter((item) => item.operation === 'annotation')
  const successfulAnnotations = annotations.reduce((sum, item) => sum + item.success_count, 0)
  return <>
    <MetricCards metrics={[
      ['Current projects', data.overview.current_projects],
      ['Current versions', data.overview.current_versions],
      ['Versions captured', data.overview.versions_captured],
      ['Searches', data.search.total_count],
      ['Successful summaries', successfulAnnotations],
      ['Restores', data.overview.restores],
    ]} />
    <div className="admin-grid">
      <article className="admin-panel"><h2>Version capture</h2><p>New versions captured per day.</p>
        <TrendPlot values={data.version_inventory_over_time} label="Versions captured" /></article>
      <article className="admin-panel"><h2>Search engagement</h2><p>Searches over time and by mode.</p>
        <TrendPlot values={data.search.over_time} label="Searches" /><Bars values={data.search.by_mode} /></article>
      <article className="admin-panel"><h2>Current inventory</h2>
        <p>Content-free counts from reporting installations.</p><Bars values={data.file_type_distribution} /></article>
      <article className="admin-panel"><h2>AI operations</h2>
        <p>{nf.format(data.ai.attempt_count)} attempts · {pf.format(data.ai.success_rate)} successful · average {nf.format(Math.round(data.ai.average_latency_ms))} ms.</p>
        <Bars values={data.ai.provider_model_mix.map((item) => ({
          label: `${item.operation} · ${item.provider} · ${item.model}`, count: item.attempt_count,
        }))} /></article>
    </div>
  </>
}

function Audience({ data }: { data: AdminStatistics }) {
  const adoption = releaseAdoption(data.app_version_distribution, __APP_VERSION__)
  const latestRate = adoption.total ? adoption.latestCount / adoption.total : 0
  return <>
    <MetricCards metrics={[
      ['Registered accounts', data.overview.registered_accounts, 'Signed-in people'],
      ['Registered installations', data.overview.registered_installations, 'Includes local profiles'],
      ['Reporting installations', data.overview.reporting_installations],
      ['New installations', data.overview.new_installations],
      ['On current release', pf.format(latestRate), adoption.latestVersion
        ? `${nf.format(adoption.latestCount)} on ${adoption.latestVersion} or newer` : 'No version data'],
      ['Need an update', adoption.outdatedCount, 'Reporting an older app version'],
    ]} />
    <div className="admin-grid">
      <article className="admin-panel"><h2>Installation growth</h2><p>First-seen installations per day.</p>
        <TrendPlot values={data.growth.new_installations} label="New installations" /></article>
      <article className="admin-panel"><h2>Weekly active installations</h2><p>Rolling seven-day active profiles.</p>
        <TrendPlot values={data.growth.weekly_active_installations} label="Weekly active installations" /></article>
      <article className="admin-panel"><h2>Update adoption</h2>
        <p>
          {adoption.latestVersion
            ? `Reporting installations on ${adoption.latestVersion} or newer compared with older releases.`
            : 'No valid Chronicle release versions were reported in this period.'}
        </p>
        <Bars values={adoption.latestVersion ? [
          { label: `Current · ${adoption.latestVersion}+`, count: adoption.latestCount },
          { label: 'Older versions', count: adoption.outdatedCount },
        ] : []} />
        <p className="admin-chart-summary">
          {adoption.total
            ? `${pf.format(latestRate)} are on the current release or newer; ${nf.format(adoption.outdatedCount)} may need an update.`
            : 'No reporting installations are available for this comparison.'}
        </p>
      </article>
      <article className="admin-panel"><h2>Release detail</h2>
        <p>Active installations by exact Chronicle version.</p>
        <Bars values={data.app_version_distribution} />
      </article>
      <article className="admin-panel"><h2>Operating systems</h2>
        <p>Active installations by OS family.</p><Bars values={data.os_distribution} /></article>
      <article className="admin-panel admin-panel-wide"><h2>Geographic reach</h2>
        <p>Coarse location derived by the API; raw IP addresses are never retained.</p>
        <WorldMap values={data.coarse_locations} /><Bars values={data.coarse_locations} /></article>
    </div>
  </>
}

function Reliability({
  data, triage, setTriage, onDeleted,
}: {
  data: AdminStatistics
  triage: Record<string, TriageEntry>
  setTriage: (next: Record<string, TriageEntry>) => void
  onDeleted: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const update = (fingerprint: string, patch: Partial<TriageEntry> | null) => {
    const next = { ...triage }
    if (patch) next[fingerprint] = { ...next[fingerprint], ...patch }
    else delete next[fingerprint]
    setTriage(next)
    localStorage.setItem(TRIAGE_KEY, JSON.stringify(next))
  }
  const removeOccurrences = async (fingerprint: string) => {
    setDeleting(fingerprint); setDeleteError('')
    try {
      await chronicle.deleteAdminErrorGroup(fingerprint)
      update(fingerprint, null)
      setConfirmDelete(null)
      await onDeleted()
    } catch {
      setDeleteError('The stored occurrences could not be deleted. Retry after checking the admin session.')
    } finally {
      setDeleting(null)
    }
  }
  const removeAllOccurrences = async () => {
    setDeleting('all'); setDeleteError('')
    try {
      await chronicle.deleteAllAdminErrors()
      setTriage({})
      localStorage.removeItem(TRIAGE_KEY)
      setConfirmDeleteAll(false)
      await onDeleted()
    } catch {
      setDeleteError('Stored errors could not be deleted. Retry after checking the admin session.')
    } finally {
      setDeleting(null)
    }
  }
  return <>
    <MetricCards metrics={[
      ['Grouped issues', data.errors.length],
      ['Affected installations', data.overview.error_affected_installations],
      ['AI failures', data.ai.failure_count],
      ['AI success rate', pf.format(data.ai.success_rate)],
    ]} />
    <article className="admin-panel admin-errors">
      <div className="admin-errors-heading"><h2>Issue inbox</h2>
        {!!data.errors.length && (confirmDeleteAll
          ? <div><button className="danger" disabled={deleting === 'all'}
            onClick={() => void removeAllOccurrences()} type="button">
            {deleting === 'all' ? 'Deleting…' : 'Confirm delete all errors'}</button>
            <button onClick={() => setConfirmDeleteAll(false)} type="button">Cancel</button></div>
          : <button className="danger" onClick={() => setConfirmDeleteAll(true)}
            type="button">Delete all errors</button>)}
      </div>
      <p>Grouped by sanitized stack fingerprint. Acknowledge keeps the group. Delete removes its
        stored occurrences, but the issue will appear again if Chronicle reports it later.</p>
      {deleteError && <p className="admin-state" role="alert">{deleteError}</p>}
      {!data.errors.length ? <p className="admin-empty">No errors reported in this period.</p> :
        data.errors.map((item) => <details className="admin-error" key={item.stack_fingerprint}>
          <summary>
            <span className={`admin-severity ${item.severity}`}>{item.severity}</span>
            <span><strong>{item.component} · {item.error_name}</strong>
              <small>{nf.format(item.count)} occurrences · {nf.format(item.affected_installations)} affected installations
                {' · '}last seen {new Date(item.last_seen_at).toLocaleString()}</small></span>
            <code>{item.stack_fingerprint.slice(0, 12)}</code>
            <span className="admin-error-state">{triage[item.stack_fingerprint]?.status ?? 'new'}</span>
          </summary>
          <div className="admin-error-detail">
            <div className="admin-error-message"><strong>{item.sanitized_message}</strong>
              <small>{item.process} process · {item.operation} · first seen {new Date(item.first_seen_at).toLocaleString()}</small>
              {!!item.sanitized_stack?.length && <pre>{item.sanitized_stack.join('\n')}</pre>}
            </div>
            <div><h3>App versions</h3><Bars values={item.app_versions} /></div>
            <div><h3>Operating systems</h3><Bars values={item.os_families} /></div>
            {!!item.provider_models.length && <div><h3>AI context</h3><Bars values={item.provider_models} /></div>}
            <div className="admin-error-actions">
              <button className={triage[item.stack_fingerprint]?.status === 'acknowledged' ? 'active' : ''}
                onClick={() => update(item.stack_fingerprint, { status: 'acknowledged' })} type="button">Acknowledge</button>
              <button className={triage[item.stack_fingerprint]?.status === 'flagged' ? 'active' : ''}
                onClick={() => update(item.stack_fingerprint, { status: 'flagged' })} type="button">Flag</button>
              {triage[item.stack_fingerprint] && <button onClick={() => update(item.stack_fingerprint, null)}
                type="button">Clear local state</button>}
              {confirmDelete === item.stack_fingerprint
                ? <><button className="danger" disabled={deleting === item.stack_fingerprint}
                  onClick={() => void removeOccurrences(item.stack_fingerprint)}
                  type="button">{deleting === item.stack_fingerprint ? 'Deleting…' : 'Confirm delete occurrences'}</button>
                  <button onClick={() => setConfirmDelete(null)} type="button">Cancel</button></>
                : <button className="danger" onClick={() => setConfirmDelete(item.stack_fingerprint)}
                  type="button">Delete occurrences</button>}
              <label><span>Local group</span><input value={triage[item.stack_fingerprint]?.group ?? ''}
                onChange={(event) => update(item.stack_fingerprint, { group: event.target.value })} /></label>
              <label><span>Private note</span><input value={triage[item.stack_fingerprint]?.note ?? ''}
                onChange={(event) => update(item.stack_fingerprint, { note: event.target.value })} /></label>
            </div>
          </div>
        </details>)}
    </article>
  </>
}

function Users({ onInspect }: { onInspect: (account: AdminAccountSummary) => void }) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [confirmDemote, setConfirmDemote] = useState<string | null>(null)
  const load = async () => {
    setLoading(true)
    try { setAccounts(await chronicle.searchAdminAccounts(query.trim())) }
    catch { setMessage('The account directory could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  const changeRole = async (account: AdminAccountSummary, enabled: boolean) => {
    setPending(account.id); setMessage('')
    try {
      const updated = await chronicle.setAdminRole(account.id, enabled)
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item))
      setMessage(`${updated.email} ${enabled ? 'is now an administrator' : 'is no longer an administrator'}.`)
      setConfirmDemote(null)
    } catch {
      setMessage('The role could not be changed. The last active administrator cannot be demoted.')
    } finally { setPending(null) }
  }
  return <article className="admin-panel admin-users">
    <div className="admin-users-heading"><div><h2>Registered accounts</h2>
      <p>Google-linked and password accounts. Local-only installations do not appear here.</p></div>
      <label><span>Search accounts</span><input type="search" value={query}
        onChange={(event) => setQuery(event.target.value)} placeholder="Email or name" /></label></div>
    <p className="admin-state" aria-live="polite">{loading ? 'Loading accounts…' : message}</p>
    <div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>Account</th><th>Last login</th><th>Environment</th><th>Inventory</th><th>Role</th><th>Actions</th></tr></thead>
      <tbody>{accounts.map((account) => <tr key={account.id}>
        <td><strong>{account.email}</strong><small>{account.display_name}
          {' · '}{account.google_linked ? 'Google-linked' : 'Password account'}
          {!account.is_active && ' · inactive'}</small></td>
        <td>{account.last_login_at ? new Date(account.last_login_at).toLocaleString() : 'Never'}</td>
        <td>{account.latest_app_version ? `v${account.latest_app_version}` : '—'}
          <small>{account.latest_os_family ?? 'No reported OS'}</small></td>
        <td>{account.installation_count} installs<small>{account.current_project_count} projects · {account.current_version_count} versions</small></td>
        <td><span className={account.is_admin ? 'admin-role admin' : 'admin-role'}>{account.is_admin ? 'Admin' : 'User'}</span></td>
        <td><div className="admin-row-actions">
          <button type="button" onClick={() => onInspect(account)}>View analytics</button>
          {!account.is_admin
            ? <button type="button" disabled={pending === account.id}
              onClick={() => void changeRole(account, true)}>Promote</button>
            : confirmDemote === account.id
              ? <><button className="danger" type="button" disabled={pending === account.id}
                onClick={() => void changeRole(account, false)}>Confirm demotion</button>
                <button type="button" onClick={() => setConfirmDemote(null)}>Cancel</button></>
              : <button type="button" onClick={() => setConfirmDemote(account.id)}>Demote</button>}
        </div></td>
      </tr>)}</tbody>
    </table></div>
    {!loading && !accounts.length && <p className="admin-empty">No registered accounts match this search.</p>}
  </article>
}

export function AdminScreen() {
  const [view, setView] = useState<View>('overview')
  const [range, setRange] = useState('30')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [account, setAccount] = useState<AdminAccountSummary | null>(null)
  const [country, setCountry] = useState('')
  const [osFamily, setOsFamily] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [data, setData] = useState<AdminStatistics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [triage, setTriage] = useState<Record<string, TriageEntry>>(
    () => JSON.parse(localStorage.getItem(TRIAGE_KEY) ?? '{}') as Record<string, TriageEntry>,
  )
  const filters = useMemo<AdminStatisticsFilters>(() => ({
    ...(
      range === 'custom'
        ? startDate && endDate ? { startDate, endDate } : {}
        : range === 'all' ? { allTime: true } : { periodDays: Number(range) }
    ),
    ...(account ? { accountId: account.id } : {}),
    ...(country ? { country } : {}),
    ...(osFamily ? { osFamily } : {}),
    ...(appVersion ? { appVersion } : {}),
  }), [range, startDate, endDate, account, country, osFamily, appVersion])
  const validRange = range !== 'custom' || (!!startDate && !!endDate && endDate >= startDate)
  const load = async () => {
    if (!validRange) return
    setLoading(true); setError('')
    try { setData(await chronicle.getAdminStatistics(filters)) }
    catch { setError('The analytics service could not be reached. Check the date range and admin session, then retry.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [filters, validRange])
  const inspectAccount = (selected: AdminAccountSummary) => {
    setAccount(selected); setView('product')
  }
  return <section className="page admin-page" aria-labelledby="admin-title">
    <PageHeader eyebrow="Control plane" title="Admin control center"
      description="Measure product success, understand adoption, diagnose reliability, and manage access." />
    <nav className="admin-tabs" role="tablist" aria-label="Admin control center views">
      {views.map((item) => <button id={`admin-tab-${item.id}`} key={item.id} type="button"
        role="tab" aria-selected={view === item.id} aria-controls={`admin-panel-${item.id}`}
        onClick={() => setView(item.id)}><strong>{item.label}</strong><span>{item.question}</span></button>)}
    </nav>
    {view !== 'users' && <Filters range={range} setRange={setRange}
      startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}
      account={account} setAccount={setAccount} country={country} setCountry={setCountry}
      osFamily={osFamily} setOsFamily={setOsFamily} appVersion={appVersion}
      setAppVersion={setAppVersion} appVersions={data?.app_version_distribution ?? []} />}
    {!validRange && <p className="admin-state" role="alert">Choose a start date and an end date on or after it.</p>}
    {loading && view !== 'users' && <p className="admin-state" role="status">Loading live analytics…</p>}
    {error && <div className="admin-state" role="alert">{error}
      {' '}<button onClick={() => void load()} type="button">Retry</button></div>}
    <div role="tabpanel" id={`admin-panel-${view}`} aria-labelledby={`admin-tab-${view}`}>
      {view === 'users' && <Users onInspect={inspectAccount} />}
      {data && !loading && view === 'overview' && <Overview data={data} onView={setView} />}
      {data && !loading && view === 'product' && <Product data={data} />}
      {data && !loading && view === 'audience' && <Audience data={data} />}
      {data && !loading && view === 'reliability' &&
        <Reliability data={data} triage={triage} setTriage={setTriage} onDeleted={load} />}
    </div>
  </section>
}
