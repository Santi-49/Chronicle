import { useState } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { chronicle } from '../lib/bridge'
import { folderForAsset, formatBytes, relativeTime, useAssets, useFolders, useVersionDetails } from '../lib/useChronicle'

interface VersionDetailsScreenProps {
  assetId: number
  projectId?: number
  versionId: number
  onBack: () => void
  onOpenProject: (projectId?: number) => void
  onOpenProjects: () => void
}

export function VersionDetailsScreen({
  assetId,
  projectId,
  versionId,
  onBack,
  onOpenProject,
  onOpenProjects,
}: VersionDetailsScreenProps) {
  const { data: version, loading, error } = useVersionDetails(versionId)
  const { assets } = useAssets()
  const { folders } = useFolders()
  const [actionState, setActionState] = useState<{ kind: 'status' | 'error'; message: string } | null>(null)
  const [originalFolderMissing, setOriginalFolderMissing] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [retryPending, setRetryPending] = useState(false)

  const asset = assets.find((a) => a.id === assetId)
  const folder = asset ? folderForAsset(asset, folders) : undefined
  const folderId = projectId ?? folder?.id
  const format = asset?.displayName.split('.').pop()?.toUpperCase()

  const handleRestore = async () => {
    setActionPending(true)
    setActionState({ kind: 'status', message: 'Restoring…' })
    try {
      const result = await chronicle.restoreVersion(versionId)
      if (result.ok) {
        setActionState({ kind: 'status', message: `Restored as version ${result.newVersionNumber}.` })
      } else {
        setOriginalFolderMissing(true)
        setActionState({ kind: 'status', message: 'The original folder is missing. Save these bytes to another location.' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionState({ kind: 'error', message: `Restore failed: ${message}` })
    } finally {
      setActionPending(false)
    }
  }

  const handleSaveCopy = async () => {
    setActionPending(true)
    setActionState({ kind: 'status', message: 'Opening the save dialog…' })
    try {
      await chronicle.saveVersionCopy(versionId)
      setActionState(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionState({ kind: 'error', message: `Could not save a copy: ${message}` })
    } finally {
      setActionPending(false)
    }
  }

  const handleRetry = async () => {
    setRetryPending(true)
    try {
      await chronicle.retryAnnotation(versionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionState({ kind: 'error', message: `Could not retry the summary: ${message}` })
    } finally {
      setRetryPending(false)
    }
  }

  if (loading || !version) {
    return (
      <section className="page version-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <button onClick={onOpenProjects} type="button">Projects</button><Icon name="chevron-right" />
          <span aria-current="page">Version</span>
        </nav>
        <div className="empty-state">
          <Icon name="info" />
          <h3>{error ? 'Version unavailable' : 'Loading version…'}</h3>
          {error && <p>{error}</p>}
        </div>
      </section>
    )
  }

  const hasChanges = version.changes.length > 0
  const isRestore = version.restoredFromVersion !== null

  return (
    <section className="page version-page" aria-labelledby="version-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onOpenProjects} type="button">Projects</button><Icon name="chevron-right" />
        {folder && (<><button onClick={() => onOpenProject(folderId)} type="button">{folder.displayName}</button><Icon name="chevron-right" /></>)}
        <button onClick={onBack} type="button">{asset?.displayName ?? 'Asset'}</button><Icon name="chevron-right" />
        <span aria-current="page">Version {version.versionNumber}</span>
      </nav>

      <header className="version-header">
        <div>
          <p className="eyebrow">Version {version.versionNumber}</p>
          <h1 id="version-title">{relativeTime(version.capturedAt)}</h1>
        </div>
        <div className="version-header-actions">
          <button
            className="secondary-button"
            disabled={actionPending}
            onClick={originalFolderMissing ? handleSaveCopy : handleRestore}
            type="button"
          >
            <Icon name="restore" />
            {actionPending ? 'Working…' : originalFolderMissing ? 'Save a copy…' : 'Restore this version'}
          </button>
          {actionState && (
            <p className={`inline-status ${actionState.kind === 'error' ? 'inline-status-error' : ''}`} role={actionState.kind === 'error' ? 'alert' : 'status'}>
              {actionState.message}
            </p>
          )}
        </div>
      </header>

      <div className="version-layout">
        <div className="version-visual-column">
          <div className="large-preview-frame">
            <AssetPreview src={version.imageUrl} alt={`Version ${version.versionNumber}`} />
          </div>
          <dl className="metadata-grid">
            <div><dt>File size</dt><dd>{formatBytes(version.sizeBytes)}</dd></div>
            <div><dt>Dimensions</dt><dd>{version.width && version.height ? `${version.width} × ${version.height}` : '—'}</dd></div>
            <div><dt>Content hash</dt><dd className="mono-value">{version.contentHash.slice(0, 8)}…{version.contentHash.slice(-4)}</dd></div>
            <div><dt>Format</dt><dd>{format ?? '—'}</dd></div>
          </dl>
        </div>

        <div className="version-information">
          <section className="detail-section">
            <div className="section-heading">
              <div>
                <p className="section-label">Change summary</p>
                <h2>What changed</h2>
              </div>
              <span className={`version-status status-${version.aiStatus}`}>
                <i /> {version.aiStatus === 'done' ? 'Ready' : version.aiStatus === 'none' ? 'Restore' : version.aiStatus}
              </span>
            </div>
            <p className="summary-lead">
              {version.summary ?? (version.aiStatus === 'failed'
                ? 'The AI change summary could not be generated.'
                : 'This version is stored locally. Its AI summary is not available yet.')}
            </p>
            {hasChanges ? (
              <ol className="changes-list">
                {version.changes.map((change) => <li key={change}>{change}</li>)}
              </ol>
            ) : (
              !isRestore && (
                <div className="inline-notice">
                  <Icon name="info" />
                  <span>
                    {version.aiStatus === 'pending'
                      ? 'The AI change summary is being generated.'
                      : version.aiStatus === 'failed'
                        ? 'Summary generation failed. Retry when the provider is available.'
                        : 'This version is stored locally. Its AI summary is not available yet.'}
                  </span>
                </div>
              )
            )}
            {version.aiStatus === 'failed' && (
              <button className="text-button" disabled={retryPending} onClick={handleRetry} type="button">
                <Icon name="refresh" /> {retryPending ? 'Queueing…' : 'Retry summary'}
              </button>
            )}
          </section>

          <section className="detail-section tags-section">
            <p className="section-label">Search tags</p>
            <h2>Indexed terms</h2>
            <p>{version.tags.length > 0 ? version.tags.join(' · ') : 'No tags indexed yet'}</p>
            {version.aiProvider && <p className="provider-note">Summarized by {version.aiProvider}</p>}
          </section>
        </div>
      </div>
    </section>
  )
}
