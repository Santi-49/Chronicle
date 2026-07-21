import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { relativeTime, usePendingJobs } from '../lib/useChronicle'

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
          <button className="secondary-button" disabled={loading} onClick={reload} type="button">
            <Icon name="refresh" />
            Refresh
          </button>
        )}
      />

      <div className="jobs-summary" aria-live="polite">
        <Icon name="refresh" />
        <strong>{jobs.length}</strong>
        <span>{jobs.length === 1 ? 'job waiting' : 'jobs waiting'}</span>
      </div>

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
            return (
              <article className="job-row" key={job.id} role="listitem">
                <AssetPreview
                  alt={job.assetName ? `Preview of ${job.assetName}` : 'Queued version preview'}
                  className="job-preview"
                  src={job.thumbnailUrl ?? undefined}
                />
                <div className="job-copy">
                  <span className="job-kind"><Icon name={copy.icon} />{copy.title}</span>
                  <h2>{job.assetName ?? 'Unknown asset'}{job.versionNumber === null ? '' : ` · v${job.versionNumber}`}</h2>
                  <p>{copy.description}</p>
                </div>
                <div className="job-meta">
                  <strong>#{index + 1} in queue</strong>
                  <span>Queued {relativeTime(job.queuedAt)}</span>
                  {job.retryCount > 0 && <span>{job.retryCount} {job.retryCount === 1 ? 'retry' : 'retries'}</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
