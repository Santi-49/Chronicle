import { useState } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { getProject, getProjectAssets, getProjectFolders } from '../data/demoData'

interface ProjectScreenProps {
  projectId: string
  onBack: () => void
  onOpenAsset: (assetId: string) => void
}

export function ProjectScreen({ projectId, onBack, onOpenAsset }: ProjectScreenProps) {
  const project = getProject(projectId)
  const projectAssets = getProjectAssets(projectId)
  const folders = getProjectFolders(projectId)
  const versionCount = projectAssets.reduce((total, asset) => total + asset.versions.length, 0)
  const [activeFolder, setActiveFolder] = useState<string | null | 'all'>('all')

  const visibleAssets =
    activeFolder === 'all'
      ? projectAssets
      : folders.find((folder) => folder.name === activeFolder)?.assets ?? projectAssets

  return (
    <section className="page project-page" aria-labelledby="project-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onBack} type="button">Projects</button><Icon name="chevron-right" /><span aria-current="page">{project.name}</span>
      </nav>
      <header className="project-detail-header">
        <div className="project-heading-lockup">
          <span className="project-folder project-folder-large" style={{ color: project.color }}><Icon name={project.icon} /></span>
          <div><p className="eyebrow">Tracked folder</p><h1 id="project-title">{project.name}</h1><p className="file-path">{project.path}</p></div>
        </div>
        <button className="secondary-button" disabled title="Opening folders is not connected in this UI skeleton" type="button">Open folder</button>
      </header>

      <div className="project-overview">
        <div><strong>{projectAssets.length}</strong><span>Assets</span></div>
        <div><strong>{versionCount}</strong><span>Versions stored</span></div>
        <div><strong>{project.updatedAt}</strong><span>Last change</span></div>
      </div>

      {folders.length > 1 && (
        <div className="folder-filter" role="tablist" aria-label="Project folders">
          <button
            aria-selected={activeFolder === 'all'}
            className={activeFolder === 'all' ? 'folder-chip folder-chip-active' : 'folder-chip'}
            onClick={() => setActiveFolder('all')}
            role="tab"
            type="button"
          >
            All files <em>{projectAssets.length}</em>
          </button>
          {folders.map((folder) => (
            <button
              aria-selected={activeFolder === folder.name}
              className={activeFolder === folder.name ? 'folder-chip folder-chip-active' : 'folder-chip'}
              key={folder.name ?? 'root'}
              onClick={() => setActiveFolder(folder.name)}
              role="tab"
              type="button"
            >
              <Icon name="folder" />
              {folder.name ?? 'Project root'} <em>{folder.assets.length}</em>
            </button>
          ))}
        </div>
      )}

      <section className="project-assets" aria-labelledby="project-assets-title">
        <div className="section-title-row">
          <div>
            <p className="section-label">Recently changed</p>
            <h2 id="project-assets-title">
              {activeFolder === 'all' ? 'Assets' : activeFolder === null ? 'Project root' : activeFolder}
            </h2>
          </div>
        </div>
        <div className="asset-grid">
          {visibleAssets.map((asset) => (
            <button className="asset-card" key={asset.id} onClick={() => onOpenAsset(asset.id)} type="button">
              <AssetPreview variant={asset.variant} />
              <span className="asset-card-body">
                <span className="asset-card-heading"><strong>{asset.name}</strong><Icon name="chevron-right" /></span>
                <span className="asset-card-summary">{asset.summary}</span>
                <span className="asset-card-meta"><span>{asset.versions.length} versions</span><span>{asset.updatedAt}</span></span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}
