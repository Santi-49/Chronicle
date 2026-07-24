import { useState } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { relativeTime, usePendingJobs } from '../lib/useChronicle'
import { chronicle } from '../lib/bridge'
import { aiFailureFeedback } from '../lib/aiFailure'

const jobLabels = {
  ai_annotation: {
    title: 'Change summary',
    description: 'Analyzing this version and describing what changed.',
    icon: 'spark' as const,
  },
  embedding: {
    title: 'Search indexing',
    description: 'Preparing this version for semantic search.',
    icon: 'search' as const,
  },
}

export function PendingJobsScreen({ onBack }: { onBack: () => void }) {
  const { jobs, loading, error, reload } = usePendingJobs()
  const [retrying, setRetrying] = useState(false)
  const [retryStatus, setRetryStatus] = useState('')
  const failedCount = jobs.filter((job) => job.state === 'failed').length
  const pendingCount = jobs.length - failedCount

  const retryAllFailed = async () => {
    setRetrying(true)
    setRetryStatus('')
    try {
      const count = await chronicle.retryAllFailedJobs()
      setRetryStatus(`${count} failed ${count === 1 ? 'job' : 'jobs'} requeued.`)
      reload()
    } catch (retryError) {
      setRetryStatus(
        `Could not retry failed jobs: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
      )
    } finally {
      setRetrying(false)
    }
  }

  return (
    <section className="page jobs-page" aria-label="Pending jobs">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onBack} type="button">Back</button>
        <Icon name="chevron-right" />
        <span aria-current="page">Pending jobs</span>
      </nav>

      <PageHeader
        eyebrow="AI queue"
        title="Pending jobs"
        description="Chronicle processes change summaries and search indexing in the background. This list updates as work completes."
        actions={(
          <>
            {failedCount > 0 && (
              <button
                className="primary-button"
                disabled={retrying}
                onClick={() => void retryAllFailed()}
                type="button"
              >
                <Icon name="refresh" />
                {retrying ? 'Requeueing…' : 'Retry all failed jobs'}
              </button>
            )}
            <button className="secondary-button" disabled={loading} onClick={reload} type="button">
              <Icon name="refresh" />
              Refresh
            </button>
          </>
        )}
      />

      <div className="jobs-summary" aria-live="polite">
        <Icon name="refresh" />
        <strong>{jobs.length}</strong>
        <span>
          {pendingCount} pending{failedCount > 0 ? ` · ${failedCount} failed` : ''}
        </span>
      </div>
      {retryStatus && <p className="inline-status" role="status">{retryStatus}</p>}

      {loading && jobs.length === 0 ? (
        <p className="jobs-message">Loading the queue…</p>
      ) : error ? (
        <div className="jobs-message jobs-error" role="alert">
          <span>Could not load pending jobs: {error}</span>
          <button className="text-button" onClick={reload} type="button">Try again</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state jobs-empty">
          <Icon name="check" />
          <h3>All caught up</h3>
          <p>There are no change summaries or search-indexing jobs waiting.</p>
        </div>
      ) : (
        <div className="jobs-list" role="list" aria-label="Pending AI jobs">
          {jobs.map((job, index) => {
            const copy = jobLabels[job.jobType]
            const failureFeedback = aiFailureFeedback(job.lastError)
            return (
              <article
                className={`job-row${job.state === 'failed' ? ' job-row-failed' : ''}`}
                key={job.id}
                role="listitem"
              >
                <AssetPreview
                  alt={job.assetName ? `Preview of ${job.assetName}` : 'Queued version preview'}
                  className="job-preview"
                  src={job.thumbnailUrl ?? undefined}
                />
                <div className="job-copy">
                  <span className="job-kind"><Icon name={copy.icon} />{copy.title}</span>
                  <h2>{job.assetName ?? 'Unknown asset'}{job.versionNumber === null ? '' : ` · v${job.versionNumber}`}</h2>
                  <p>
                    {job.state === 'failed'
                      ? `${failureFeedback.title}: ${failureFeedback.explanation}`
                      : copy.description}
                  </p>
                  {job.state === 'failed' && (
                    <p className="job-failure-action">{failureFeedback.action}</p>
                  )}
                </div>
                <div className="job-meta">
                  <strong>{job.state === 'failed' ? 'Needs manual retry' : `#${index + 1} in queue`}</strong>
                  <span>Queued {relativeTime(job.queuedAt)}</span>
                  {job.retryCount > 0 && <span>{job.retryCount} {job.retryCount === 1 ? 'retry' : 'retries'}</span>}
                  {job.state === 'failed' && job.lastError?.status != null && (
                    <span>HTTP {job.lastError.status}</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
