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
  const { versions } = useTimeline(assetId)
  const { assets } = useAssets()
  const { folders } = useFolders()

  const asset = assets.find((a) => a.id === assetId)
  const folder = asset ? folderForAsset(asset, folders) : undefined
  const folderId = projectId ?? folder?.id

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
        </div>
        <div className="timeline-count">
          <strong>{versions.length}</strong>
          <span>versions stored</span>
        </div>
      </header>

      <div className="timeline-list" role="list" aria-label={`Versions of ${asset?.displayName ?? 'asset'}`}>
        {versions.map((version, index) => (
          <button
            className="timeline-row"
            key={version.id}
            onClick={() => onOpenVersion(version.id)}
            role="listitem"
            type="button"
          >
            <span className="timeline-rail" aria-hidden="true">
              <i />
            </span>
            <span className="version-number">v{version.versionNumber}</span>
            <span className="version-copy">
              <span className="version-time">{relativeTime(version.capturedAt)}{index === 0 && <em>Latest</em>}</span>
              <strong>{version.summary ?? 'Waiting for an AI change summary.'}</strong>
              <span className={`version-status status-${version.aiStatus}`}>
                <i /> {statusLabels[version.aiStatus]}
              </span>
            </span>
            <Icon name="chevron-right" />
          </button>
        ))}
      </div>
    </section>
  )
}
