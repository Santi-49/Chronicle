import { useRef, type KeyboardEvent } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import type { AiStatus } from '../../../shared/ipc'
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
      <div className="timeline-list" role="group" aria-label={`Versions of ${asset?.displayName ?? 'asset'}`}>
        {versions.map((version, index) => {
          const fallbackSummary = version.aiStatus === 'failed'
            ? 'Summary generation failed. Open this version to retry.'
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
              <span className={`version-status status-${version.aiStatus}`}>
                <i /> {statusLabels[version.aiStatus]}
              </span>
            </span>
            <Icon name="chevron-right" />
          </button>
          )
        })}
      </div>
      )}
    </section>
  )
}
