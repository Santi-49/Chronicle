import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { getAsset, getProject, type AiStatus } from '../data/demoData'

interface TimelineScreenProps {
  assetId: string
  projectId: string
  onBack: () => void
  onOpenProjects: () => void
  onOpenVersion: (versionId: string) => void
}

const statusLabels: Record<AiStatus, string> = {
  done: 'Summary ready',
  pending: 'Summary pending',
  failed: 'Summary failed'
}

export function TimelineScreen({ assetId, projectId, onBack, onOpenProjects, onOpenVersion }: TimelineScreenProps) {
  const asset = getAsset(assetId)
  const project = getProject(projectId)

  return (
    <section className="page timeline-page" aria-labelledby="timeline-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onOpenProjects} type="button">Projects</button><Icon name="chevron-right" />
        <button onClick={onBack} type="button">{project.name}</button><Icon name="chevron-right" />
        <span aria-current="page">{asset.name}</span>
      </nav>

      <header className="asset-detail-header">
        <AssetPreview variant={asset.variant} className="asset-header-preview" />
        <div>
          <p className="eyebrow">Version timeline</p>
          <h1 id="timeline-title">{asset.name}</h1>
          <p className="file-path">{asset.path}</p>
        </div>
        <div className="timeline-count">
          <strong>{asset.versions.length}</strong>
          <span>versions stored</span>
        </div>
      </header>

      <div className="timeline-list" role="list" aria-label={`Versions of ${asset.name}`}>
        {asset.versions.map((version, index) => (
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
            <span className="version-number">v{version.number}</span>
            <span className="version-copy">
              <span className="version-time">{version.createdAt}{index === 0 && <em>Latest</em>}</span>
              <strong>{version.summary}</strong>
              <span className={`version-status status-${version.aiStatus}`}>
                <i /> {statusLabels[version.aiStatus]}
              </span>
            </span>
            <span className="version-size">{version.size}</span>
            <Icon name="chevron-right" />
          </button>
        ))}
      </div>
    </section>
  )
}
