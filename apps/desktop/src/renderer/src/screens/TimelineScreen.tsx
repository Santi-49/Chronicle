import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import type { AiStatus } from '../../../shared/ipc'
import { chronicle } from '../lib/bridge'
import { aiFailureFeedback } from '../lib/aiFailure'
import { folderForAsset, relativeTime, useAssets, useFolders, useTimeline } from '../lib/useChronicle'

interface TimelineScreenProps {
  assetId: number
  projectId?: number
  onBack: (projectId?: number) => void
  onOpenProjects: () => void
  onOpenVersion: (versionId: number) => void
}

const statusLabels: Record<AiStatus, string> = {
  done: 'Summary ready',
  pending: 'Summary pending',
  failed: 'Summary failed',
  none: 'Restored version',
}

function HistoryResetControl({
  assetId,
  assetName,
  versionCount,
  onReset,
}: {
  assetId: number
  assetName: string
  versionCount: number
  onReset: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hasOpened = useRef(false)
  const descriptionId = `history-reset-${assetId}`

  useEffect(() => {
    if (confirming) {
      hasOpened.current = true
      inputRef.current?.focus()
    } else if (hasOpened.current) {
      triggerRef.current?.focus()
    }
  }, [confirming])

  const close = () => {
    if (busy) return
    setConfirming(false)
    setConfirmation('')
    setError(null)
  }

  const reset = async () => {
    setBusy(true)
    setError(null)
    try {
      await chronicle.resetAssetHistory(assetId)
      setSuccess('History reset to v1. A fresh initial annotation is queued.')
      setConfirmation('')
      setConfirming(false)
      onReset()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <div className="timeline-history-tools">
        {success && <p role="status">{success}</p>}
        <button
          className="text-button timeline-reset-trigger"
          onClick={() => {
            setSuccess(null)
            setConfirming(true)
          }}
          ref={triggerRef}
          type="button"
        >
          <Icon name="clock" /> Reset history…
        </button>
      </div>
    )
  }

  const removedCount = Math.max(versionCount - 1, 0)
  return (
    <section
      aria-describedby={descriptionId}
      aria-labelledby={`${descriptionId}-title`}
      className="history-reset-confirmation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
      }}
    >
      <p className="section-label">Destructive history action</p>
      <h2 id={`${descriptionId}-title`}>Start “{assetName}” over at v1?</h2>
      <p id={descriptionId}>
        The latest stored image becomes the new v1. {removedCount > 0
          ? `${removedCount} earlier ${removedCount === 1 ? 'version' : 'versions'}, annotations, and search data are permanently removed.`
          : 'Its existing annotation and search data are permanently replaced.'}{' '}
        Chronicle will then queue a fresh initial-version annotation.
      </p>
      <label className="history-reset-field">
        <span>Type <strong>RESET</strong> to continue</span>
        <input
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setConfirmation(event.target.value)}
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={confirmation}
        />
      </label>
      <div className="history-reset-actions">
        <button className="secondary-button" disabled={busy} onClick={close} type="button">Cancel</button>
        <button
          className="danger-button"
          disabled={busy || confirmation.trim() !== 'RESET'}
          onClick={() => void reset()}
          type="button"
        >
          <Icon name="delete" /> {busy ? 'Resetting…' : 'Reset history to v1'}
        </button>
      </div>
      {error && <p className="history-reset-error" role="alert">Could not reset history: {error}</p>}
    </section>
  )
}

export function TimelineScreen({ assetId, projectId, onBack, onOpenProjects, onOpenVersion }: TimelineScreenProps) {
  const { versions, loading, error, reload } = useTimeline(assetId)
  const { assets } = useAssets()
  const { folders } = useFolders()

  const asset = assets.find((a) => a.id === assetId)
  const folder = asset ? folderForAsset(asset, folders) : undefined
  const folderId = projectId ?? folder?.id
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, versions.length - 1)
    if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0)
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = versions.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    rowRefs.current[nextIndex]?.focus()
  }

  return (
    <section className="page timeline-page" aria-labelledby="timeline-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onOpenProjects} type="button">Projects</button><Icon name="chevron-right" />
        {folder && (<><button onClick={() => onBack(folderId)} type="button">{folder.displayName}</button><Icon name="chevron-right" /></>)}
        <span aria-current="page">{asset?.displayName ?? 'Asset'}</span>
      </nav>

      <header className="asset-detail-header">
        <AssetPreview src={asset?.thumbnailUrl} alt={asset?.displayName} className="asset-header-preview" />
        <div>
          <p className="eyebrow">Version timeline</p>
          <h1 id="timeline-title">{asset?.displayName ?? 'Asset'}</h1>
          {asset && <p className="file-path">{asset.path}</p>}
          {asset && !asset.onDisk && <p className="asset-missing-notice"><Icon name="info" /> File no longer on disk; stored versions remain available.</p>}
        </div>
        <div className="timeline-count">
          <strong>{versions.length}</strong>
          <span>versions stored</span>
        </div>
      </header>

      {loading ? (
        <div className="empty-state" role="status"><Icon name="info" /><h3>Loading timeline…</h3></div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <Icon name="info" /><h3>Timeline unavailable</h3><p>{error}</p>
          <button className="secondary-button" onClick={reload} type="button">Try again</button>
        </div>
      ) : versions.length === 0 ? (
        <div className="empty-state"><Icon name="info" /><h3>No versions yet</h3><p>Chronicle will add the first version after this file is captured.</p></div>
      ) : (
        <>
          <div className="timeline-list" role="group" aria-label={`Versions of ${asset?.displayName ?? 'asset'}`}>
            {versions.map((version, index) => {
              const failureFeedback = aiFailureFeedback(version.aiFailure)
              const fallbackSummary = version.aiStatus === 'failed'
                ? failureFeedback.title
                : version.aiStatus === 'pending'
                  ? 'Waiting for an AI change summary.'
                  : version.aiStatus === 'none'
                    ? 'Restored version.'
                    : 'No change summary is available.'
              return (
                <button
                  className="timeline-row"
                  key={version.id}
                  onClick={() => onOpenVersion(version.id)}
                  onKeyDown={(event) => moveFocus(event, index)}
                  ref={(element) => { rowRefs.current[index] = element }}
                  type="button"
                >
                  <span className="timeline-rail" aria-hidden="true">
                    <i />
                  </span>
                  <span className="version-number">v{version.versionNumber}</span>
                  <span className="version-copy">
                    <span className="version-time">{relativeTime(version.capturedAt)}{index === 0 && <em>Latest</em>}</span>
                    <strong>{version.summary ?? fallbackSummary}</strong>
                    {version.aiStatus === 'failed' && (
                      <small className="version-failure-guidance">{failureFeedback.action}</small>
                    )}
                    <span className={`version-status status-${version.aiStatus}`}>
                      <i /> {statusLabels[version.aiStatus]}
                    </span>
                  </span>
                  <Icon name="chevron-right" />
                </button>
              )
            })}
          </div>
          {asset && (
            <HistoryResetControl
              assetId={asset.id}
              assetName={asset.displayName}
              onReset={reload}
              versionCount={versions.length}
            />
          )}
        </>
      )}
    </section>
  )
}
