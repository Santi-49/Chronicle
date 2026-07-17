import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { getAsset, getProject, getVersion } from '../data/demoData'

interface VersionDetailsScreenProps {
  assetId: string
  projectId: string
  versionId: string
  onBack: () => void
  onOpenProject: () => void
  onOpenProjects: () => void
}

export function VersionDetailsScreen({
  assetId,
  projectId,
  versionId,
  onBack,
  onOpenProject,
  onOpenProjects
}: VersionDetailsScreenProps) {
  const asset = getAsset(assetId)
  const project = getProject(projectId)
  const version = getVersion(assetId, versionId)

  return (
    <section className="page version-page" aria-labelledby="version-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onOpenProjects} type="button">Projects</button><Icon name="chevron-right" />
        <button onClick={onOpenProject} type="button">{project.name}</button><Icon name="chevron-right" />
        <button onClick={onBack} type="button">{asset.name}</button><Icon name="chevron-right" />
        <span aria-current="page">Version {version.number}</span>
      </nav>

      <header className="version-header">
        <div>
          <p className="eyebrow">Version {version.number}</p>
          <h1 id="version-title">{version.createdAt}</h1>
        </div>
        <button className="secondary-button" disabled title="Restore is not connected in this UI skeleton" type="button">
          <Icon name="restore" />
          Restore this version
        </button>
      </header>

      <div className="version-layout">
        <div className="version-visual-column">
          <div className="large-preview-frame">
            <AssetPreview variant={asset.variant} />
          </div>
          <dl className="metadata-grid">
            <div><dt>File size</dt><dd>{version.size}</dd></div>
            <div><dt>Dimensions</dt><dd>{version.dimensions}</dd></div>
            <div><dt>Content hash</dt><dd>{version.hash}</dd></div>
            <div><dt>Format</dt><dd>{asset.name.split('.').pop()?.toUpperCase()}</dd></div>
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
                <i /> {version.aiStatus === 'done' ? 'Ready' : version.aiStatus}
              </span>
            </div>
            <p className="summary-lead">{version.summary}</p>
            {version.changes.length > 0 ? (
              <ol className="changes-list">
                {version.changes.map((change) => <li key={change}>{change}</li>)}
              </ol>
            ) : (
              <div className="inline-notice">
                <Icon name="info" />
                <span>This version is stored locally. Its AI summary is not available yet.</span>
              </div>
            )}
            {version.aiStatus === 'failed' && (
              <button className="text-button" disabled title="AI jobs are not connected in this UI skeleton" type="button"><Icon name="refresh" /> Retry summary</button>
            )}
          </section>

          <section className="detail-section tags-section">
            <p className="section-label">Search tags</p>
            <h2>Indexed terms</h2>
            <p>{version.tags.length > 0 ? version.tags.join(' · ') : 'No tags indexed yet'}</p>
          </section>
        </div>
      </div>
    </section>
  )
}
