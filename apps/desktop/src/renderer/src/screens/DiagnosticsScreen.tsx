import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ApplicationDiagnostic,
  ApplicationDiagnosticLevel,
  ControlPlaneDiagnostic,
  PendingControlPlaneEvent,
} from '../../../shared/ipc'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import {
  clearDiagnosticLogs,
  getDiagnosticLogs,
  subscribeToDiagnosticLogs,
  type DiagnosticLogEntry,
  type DiagnosticLogLevel,
} from '../lib/diagnostics'
import { totalVersions, useAppStatus, useAssets, useFolders, usePendingJobs } from '../lib/useChronicle'
import { chronicle } from '../lib/bridge'

type LevelFilter = 'all' | DiagnosticLogLevel
type ApplicationLevelFilter = 'all' | ApplicationDiagnosticLevel
type DiagnosticSectionId =
  | 'runtime'
  | 'application-events'
  | 'control-plane-health'
  | 'pending-control-plane'
  | 'control-plane-requests'
  | 'renderer-logs'

function formatLogExport(logs: DiagnosticLogEntry[]): string {
  return logs
    .map((entry) => `${entry.timestamp} ${entry.level.toUpperCase().padEnd(5)} ${entry.message}`)
    .join('\n')
}

function prettyJson(value: unknown): string {
  if (value === null) return 'None'
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

export function DiagnosticsScreen({ developmentBuild }: { developmentBuild: boolean }) {
  const [logs, setLogs] = useState(getDiagnosticLogs)
  const [level, setLevel] = useState<LevelFilter>('all')
  const [query, setQuery] = useState('')
  const [copyState, setCopyState] = useState('')
  const [controlPlaneDiagnostics, setControlPlaneDiagnostics] = useState<ControlPlaneDiagnostic[]>([])
  const [applicationDiagnostics, setApplicationDiagnostics] = useState<ApplicationDiagnostic[]>([])
  const [applicationLevel, setApplicationLevel] = useState<ApplicationLevelFilter>('all')
  const [applicationQuery, setApplicationQuery] = useState('')
  const [pendingControlPlaneEvents, setPendingControlPlaneEvents] = useState<PendingControlPlaneEvent[]>([])
  const [healthChecking, setHealthChecking] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<DiagnosticSectionId>>(
    () => new Set(),
  )
  const healthProbeStarted = useRef(false)
  const status = useAppStatus()
  const { assets } = useAssets()
  const { folders } = useFolders()
  const { jobs } = usePendingJobs()
  const pendingJobCount = status
    ? Object.values(status.pendingJobs).reduce((sum, count) => sum + count, 0)
    : jobs.length

  useEffect(() => subscribeToDiagnosticLogs(() => setLogs(getDiagnosticLogs())), [])
  useEffect(() => {
    let disposed = false
    const loadPending = () => {
      void chronicle.listPendingControlPlaneEvents().then((events) => {
        if (!disposed) setPendingControlPlaneEvents(events)
      })
    }
    void chronicle.listControlPlaneDiagnostics().then((entries) => {
      if (!disposed) {
        setControlPlaneDiagnostics((current) => {
          const merged = new Map([...entries, ...current].map((entry) => [entry.id, entry]))
          return [...merged.values()].sort((a, b) => a.id - b.id).slice(-200)
        })
      }
    })
    void chronicle.listApplicationDiagnostics().then((entries) => {
      if (!disposed) {
        setApplicationDiagnostics((current) => {
          const merged = new Map([...entries, ...current].map((entry) => [entry.id, entry]))
          return [...merged.values()].sort((a, b) => a.id - b.id).slice(-500)
        })
      }
    })
    loadPending()
    const unsubscribe = chronicle.on('controlPlaneDiagnostic', (entry) => {
      setControlPlaneDiagnostics((current) => [...current, entry].slice(-200))
      window.setTimeout(loadPending, 0)
    })
    const unsubscribeApplication = chronicle.on('applicationDiagnostic', (entry) => {
      setApplicationDiagnostics((current) => [...current, entry].slice(-500))
    })
    const interval = window.setInterval(loadPending, 2_000)
    return () => {
      disposed = true
      unsubscribe()
      unsubscribeApplication()
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (healthProbeStarted.current) return
    healthProbeStarted.current = true
    setHealthChecking(true)
    void chronicle.probeControlPlaneHealth().finally(() => setHealthChecking(false))
  }, [])

  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return logs.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false
      return normalizedQuery === '' || entry.message.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [level, logs, query])
  const latestHealth = [...controlPlaneDiagnostics].reverse().find((entry) => entry.kind === 'health')
  const controlPlaneRequests = useMemo(
    () => controlPlaneDiagnostics.filter((entry) => entry.kind === 'request'),
    [controlPlaneDiagnostics],
  )
  const visibleApplicationDiagnostics = useMemo(() => {
    const normalizedQuery = applicationQuery.trim().toLocaleLowerCase()
    return applicationDiagnostics.filter((entry) => {
      if (applicationLevel !== 'all' && entry.level !== applicationLevel) return false
      if (normalizedQuery === '') return true
      return [
        entry.source,
        entry.event,
        entry.message,
        prettyJson(entry.context),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    })
  }, [applicationDiagnostics, applicationLevel, applicationQuery])

  const probeHealth = async () => {
    setHealthChecking(true)
    try {
      await chronicle.probeControlPlaneHealth()
    } finally {
      setHealthChecking(false)
    }
  }

  const toggleSection = (section: DiagnosticSectionId) => {
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const collapseButton = (section: DiagnosticSectionId, label: string) => {
    const collapsed = collapsedSections.has(section)
    return (
      <button
        aria-controls={`diagnostics-${section}-content`}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
        className="text-button diagnostics-collapse-toggle"
        onClick={() => toggleSection(section)}
        type="button"
      >
        {collapsed ? 'Expand' : 'Collapse'}
      </button>
    )
  }

  const sectionClass = (section: DiagnosticSectionId) =>
    `diagnostics-section${collapsedSections.has(section) ? ' diagnostics-section-collapsed' : ''}`

  const copyReport = async () => {
    const report = [
      `Chronicle ${__APP_VERSION__}`,
      `Build: ${developmentBuild ? 'development' : 'packaged'}`,
      `Platform: ${navigator.platform}`,
      `Online: ${status?.online ?? navigator.onLine}`,
      `Watched folders: ${status?.watchedFolders ?? folders.length}`,
      `Assets: ${assets.length}`,
      `Versions: ${totalVersions(assets)}`,
      `Pending jobs: ${pendingJobCount}`,
      '',
      'Pending control-plane events:',
      prettyJson(pendingControlPlaneEvents),
      '',
      'Application events:',
      prettyJson(applicationDiagnostics),
      '',
      'Control-plane request audit:',
      prettyJson(controlPlaneRequests),
      '',
      formatLogExport(visibleLogs),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(report)
      setCopyState('Diagnostic report copied.')
    } catch {
      setCopyState('Copy failed. Select individual log text instead.')
    }
  }

  return (
    <section className="page diagnostics-page" aria-label="Diagnostics">
      <PageHeader
        eyebrow="Developer tools"
        title="Diagnostics"
        description="Inspect safe runtime state and recent renderer logs without leaving Chronicle."
        actions={(
          <button className="secondary-button" onClick={() => void copyReport()} type="button">
            Copy report
          </button>
        )}
      />

      <p className="diagnostics-disclosure">
        This view keeps bounded renderer and main-process logs in memory and redacts common
        credential fields. It does not expose API keys or file contents.
      </p>

      <section className={sectionClass('runtime')} aria-labelledby="runtime-heading">
        <div className="diagnostics-section-heading">
          <div>
            <p className="section-label">Runtime snapshot</p>
            <h2 id="runtime-heading">Application state</h2>
          </div>
          <div className="diagnostics-actions">
            <span className={status?.online ?? navigator.onLine ? 'status-pill status-pill-success' : 'status-pill'}>
              {status?.online ?? navigator.onLine ? 'Online' : 'Offline'}
            </span>
            {collapseButton('runtime', 'Application state')}
          </div>
        </div>
        <dl className="diagnostics-grid" id="diagnostics-runtime-content">
          <div><dt>Version</dt><dd>{__APP_VERSION__}</dd></div>
          <div><dt>Build</dt><dd>{developmentBuild ? 'Development' : 'Packaged'}</dd></div>
          <div><dt>Platform</dt><dd>{navigator.platform || 'Unknown'}</dd></div>
          <div><dt>Bridge</dt><dd>{window.chronicle ? 'Connected' : 'Unavailable'}</dd></div>
          <div><dt>Watched folders</dt><dd>{status?.watchedFolders ?? folders.length}</dd></div>
          <div><dt>Assets / versions</dt><dd>{assets.length} / {totalVersions(assets)}</dd></div>
          <div><dt>AI configured</dt><dd>{status ? (status.aiConfigured ? 'Yes' : 'No') : 'Loading…'}</dd></div>
          <div><dt>Pending jobs</dt><dd>{pendingJobCount}</dd></div>
        </dl>
      </section>

      <section className={sectionClass('application-events')} aria-labelledby="application-events-heading">
        <div className="diagnostics-section-heading">
          <div>
            <p className="section-label">Main process</p>
            <h2 id="application-events-heading">Application events</h2>
          </div>
          <div className="diagnostics-actions">
            <span className="status-pill">{applicationDiagnostics.length} events</span>
            {collapseButton('application-events', 'Application events')}
          </div>
        </div>
        <div id="diagnostics-application-events-content">
        <p className="control-plane-audit-disclosure">
          Project changes, version captures, restores, watcher activity, AI work, telemetry
          delivery, control-plane failures, and unexpected process errors appear here.
        </p>
        <div className="diagnostics-filters">
          <label>
            <span>Search events</span>
            <input
              onChange={(event) => setApplicationQuery(event.target.value)}
              placeholder="Event, source, message, or context"
              type="search"
              value={applicationQuery}
            />
          </label>
          <label>
            <span>Level</span>
            <select
              onChange={(event) => setApplicationLevel(event.target.value as ApplicationLevelFilter)}
              value={applicationLevel}
            >
              <option value="all">All levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warnings</option>
              <option value="error">Errors</option>
            </select>
          </label>
          <span className="diagnostics-log-count" aria-live="polite">
            {visibleApplicationDiagnostics.length} of {applicationDiagnostics.length}
          </span>
        </div>
        {visibleApplicationDiagnostics.length === 0 ? (
          <div className="diagnostics-empty">
            <Icon name="terminal" />
            <p>
              {applicationDiagnostics.length === 0
                ? 'No application events have been recorded yet.'
                : 'No application events match these filters.'}
            </p>
          </div>
        ) : (
          <ol className="application-event-list">
            {[...visibleApplicationDiagnostics].reverse().map((entry) => (
              <li className={`application-event application-event-${entry.level}`} key={entry.id}>
                <details className="diagnostic-item-disclosure">
                  <summary className="application-event-summary">
                    <div>
                      <span className="application-event-source">{entry.source}</span>
                      <strong>{entry.event}</strong>
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                    <span className={`diagnostics-log-level diagnostics-log-${entry.level}`}>
                      {entry.level}
                    </span>
                  </summary>
                  <div className="diagnostic-item-content">
                    <p>{entry.message}</p>
                    {entry.context !== null && (
                      <div className="control-plane-payload">
                        <h3>Context</h3>
                        <pre>{prettyJson(entry.context)}</pre>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
        </div>
      </section>

      <section className={sectionClass('control-plane-health')} aria-labelledby="control-plane-health-heading">
        <div className="diagnostics-section-heading">
          <div>
            <p className="section-label">Control plane</p>
            <h2 id="control-plane-health-heading">Service health</h2>
          </div>
          <div className="diagnostics-health-actions">
            <span className={latestHealth?.ok ? 'status-pill status-pill-success' : 'status-pill'}>
              {healthChecking ? 'Checking…' : latestHealth ? (latestHealth.ok ? 'Healthy' : 'Unhealthy') : 'Not checked'}
            </span>
            <button
              className="secondary-button compact-button"
              disabled={healthChecking}
              onClick={() => void probeHealth()}
              type="button"
            >
              Check now
            </button>
            {collapseButton('control-plane-health', 'Service health')}
          </div>
        </div>
        <div id="diagnostics-control-plane-health-content">
        {latestHealth ? (
          <div className="control-plane-health-details">
            <dl>
              <div><dt>Endpoint</dt><dd>{latestHealth.url}</dd></div>
              <div><dt>HTTP status</dt><dd>{latestHealth.status ?? 'No response'}</dd></div>
              <div><dt>Latency</dt><dd>{latestHealth.durationMs} ms</dd></div>
              <div><dt>Checked</dt><dd>{new Date(latestHealth.timestamp).toLocaleString()}</dd></div>
            </dl>
            <div>
              <h3>Health response</h3>
              <pre>{prettyJson(latestHealth.responseBody)}</pre>
              {latestHealth.error && <p className="diagnostics-request-error">{latestHealth.error}</p>}
            </div>
          </div>
        ) : (
          <div className="diagnostics-empty"><p>No control-plane health check has completed yet.</p></div>
        )}
        </div>
      </section>

      <section className={sectionClass('pending-control-plane')} aria-labelledby="pending-control-plane-heading">
        <div className="diagnostics-section-heading">
          <div>
            <p className="section-label">Offline queue</p>
            <h2 id="pending-control-plane-heading">Pending to send</h2>
          </div>
          <div className="diagnostics-actions">
            <span className="status-pill">{pendingControlPlaneEvents.length} queued</span>
            {collapseButton('pending-control-plane', 'Pending to send')}
          </div>
        </div>
        <div id="diagnostics-pending-control-plane-content">
        {pendingControlPlaneEvents.length === 0 ? (
          <div className="diagnostics-empty">
            <Icon name="check" />
            <p>No control-plane events are waiting to be sent.</p>
          </div>
        ) : (
          <ol className="control-plane-request-list">
            {pendingControlPlaneEvents.map((event) => (
              <li className="control-plane-request" key={event.id}>
                <details className="diagnostic-item-disclosure">
                  <summary className="control-plane-request-summary">
                    <div>
                      <strong>Queue #{event.id}</strong>
                      <span>{new Date(event.queuedAt).toLocaleString()} · {event.retryCount} retries</span>
                    </div>
                    <span className="status-pill">Pending</span>
                  </summary>
                  <div className="diagnostic-item-content">
                    <div className="control-plane-payload">
                      <h3>Payload</h3>
                      <pre>{prettyJson(event.payload)}</pre>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
        </div>
      </section>

      <section className={sectionClass('control-plane-requests')} aria-labelledby="control-plane-requests-heading">
        <div className="diagnostics-section-heading">
          <div>
            <p className="section-label">Sanitized network audit</p>
            <h2 id="control-plane-requests-heading">Data sent to the control plane</h2>
          </div>
          <div className="diagnostics-actions">
            <span className="status-pill">{controlPlaneRequests.length} requests</span>
            <button
              className="text-button"
              disabled={controlPlaneRequests.length === 0}
              onClick={() => {
                void chronicle.clearControlPlaneDiagnostics().then(() => {
                  setControlPlaneDiagnostics((entries) =>
                    entries.filter((entry) => entry.kind === 'health'),
                  )
                })
              }}
              type="button"
            >
              Clear
            </button>
            {collapseButton('control-plane-requests', 'Data sent to the control plane')}
          </div>
        </div>
        <div id="diagnostics-control-plane-requests-content">
        <p className="control-plane-audit-disclosure">
          Bodies and query strings are shown as sent. Authorization, passwords, OAuth credentials,
          tokens, passphrases, and encrypted key envelopes are explicitly redacted.
        </p>
        {controlPlaneRequests.length === 0 ? (
          <div className="diagnostics-empty"><p>No control-plane requests have been recorded in this session.</p></div>
        ) : (
          <ol className="control-plane-request-list">
            {[...controlPlaneRequests].reverse().map((entry) => (
              <li className="control-plane-request" key={entry.id}>
                <details className="diagnostic-item-disclosure">
                  <summary className="control-plane-request-summary">
                    <div>
                      <span className="control-plane-method">{entry.method}</span>
                      <strong>{entry.url}</strong>
                      <span>{new Date(entry.timestamp).toLocaleString()} · {entry.durationMs} ms</span>
                    </div>
                    <span className={entry.ok ? 'status-pill status-pill-success' : 'status-pill'}>
                      {entry.status ?? 'Network error'}
                    </span>
                  </summary>
                  <div className="diagnostic-item-content">
                    <div className="control-plane-request-data">
                      <div className="control-plane-payload">
                        <h3>Headers</h3>
                        <pre>{prettyJson(entry.requestHeaders)}</pre>
                      </div>
                      <div className="control-plane-payload">
                        <h3>Request body</h3>
                        <pre>{prettyJson(entry.requestBody)}</pre>
                      </div>
                      <div className="control-plane-payload">
                        <h3>Response body</h3>
                        <pre>{prettyJson(entry.responseBody)}</pre>
                      </div>
                    </div>
                    {entry.error && <p className="diagnostics-request-error">{entry.error}</p>}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
        </div>
      </section>

      <section className={sectionClass('renderer-logs')} aria-labelledby="logs-heading">
        <div className="diagnostics-section-heading diagnostics-logs-heading">
          <div>
            <p className="section-label">Renderer process</p>
            <h2 id="logs-heading">Recent logs</h2>
          </div>
          <div className="diagnostics-actions">
            <button className="text-button" onClick={clearDiagnosticLogs} type="button">Clear</button>
            {collapseButton('renderer-logs', 'Recent logs')}
          </div>
        </div>

        <div id="diagnostics-renderer-logs-content">
        <div className="diagnostics-filters">
          <label>
            <span>Search logs</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Filter by message" type="search" value={query} />
          </label>
          <label>
            <span>Level</span>
            <select onChange={(event) => setLevel(event.target.value as LevelFilter)} value={level}>
              <option value="all">All levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warnings</option>
              <option value="error">Errors</option>
            </select>
          </label>
          <span className="diagnostics-log-count" aria-live="polite">{visibleLogs.length} of {logs.length}</span>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="diagnostics-empty">
            <Icon name="terminal" />
            <p>{logs.length === 0 ? 'No renderer messages have been recorded yet.' : 'No logs match these filters.'}</p>
          </div>
        ) : (
          <ol className="diagnostics-log-list">
            {visibleLogs.map((entry) => (
              <li className={`diagnostics-log diagnostics-log-${entry.level}`} key={entry.id}>
                <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                <span className="diagnostics-log-level">{entry.level}</span>
                <pre>{entry.message}</pre>
              </li>
            ))}
          </ol>
        )}
        </div>
      </section>
      {copyState && <p className="inline-status diagnostics-copy-status" role="status">{copyState}</p>}
    </section>
  )
}
