import { useState } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { FolderGlyph } from '../components/FolderGlyph'
import { Icon } from '../components/Icon'
import {
  assetsForFolder,
  groupBySubfolder,
  relativeTime,
  totalVersions,
  useAssets,
  useFolders,
} from '../lib/useChronicle'

interface ProjectScreenProps {
  projectId: number
  onBack: () => void
  onEdit: () => void
  onOpenAsset: (assetId: number) => void
}

export function ProjectScreen({ projectId, onBack, onEdit, onOpenAsset }: ProjectScreenProps) {
  const { folders, loading: foldersLoading } = useFolders()
  const { assets } = useAssets()
  const [activeFolder, setActiveFolder] = useState<string | null | 'all'>('all')

  const project = folders.find((folder) => folder.id === projectId)

  if (!project) {
    return (
      <section className="page project-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <button onClick={onBack} type="button">Projects</button><Icon name="chevron-right" /><span aria-current="page">Project</span>
        </nav>
        <div className="empty-state">
          <Icon name="info" />
          <h3>{foldersLoading ? 'Loading project…' : 'Project not found'}</h3>
          {!foldersLoading && <p>This folder is no longer tracked.</p>}
        </div>
      </section>
    )
  }

  const projectAssets = assetsForFolder(project, assets)
  const subfolders = groupBySubfolder(project, assets)
  const visibleAssets =
    activeFolder === 'all'
      ? projectAssets
      : subfolders.find((folder) => folder.name === activeFolder)?.assets ?? projectAssets

  return (
    <section className="page project-page" aria-labelledby="project-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onBack} type="button">Projects</button><Icon name="chevron-right" /><span aria-current="page">{project.displayName}</span>
      </nav>
      <header className="project-detail-header">
        <div className="project-heading-lockup">
          <FolderGlyph icon={project.icon} color={project.color} className="project-folder-large" />
          <div>
            <p className="eyebrow">Tracked folder</p>
            <h1 id="project-title">{project.displayName}</h1>
            {project.description && <p className="project-description">{project.description}</p>}
            <p className="file-path">{project.path}</p>
          </div>
        </div>
        <button className="secondary-button project-edit-button" onClick={onEdit} type="button">
          <Icon name="edit" />
          Edit project
        </button>
      </header>

      <div className="project-overview">
        <div><strong>{projectAssets.length}</strong><span>Assets</span></div>
        <div><strong>{totalVersions(projectAssets)}</strong><span>Versions stored</span></div>
        <div><strong>{relativeTime(projectAssets[0]?.lastCapturedAt ?? null)}</strong><span>Last change</span></div>
      </div>

      {projectAssets.length === 0 ? (
        <div className="empty-state">
          <Icon name="image" />
          <h3>No versions captured yet</h3>
          <p>Save a PNG or JPG inside this folder and it will appear here within seconds.</p>
        </div>
      ) : (
        <>
          {subfolders.length > 1 && (
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
              {subfolders.map((folder) => (
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
                  <AssetPreview src={asset.thumbnailUrl} alt={asset.displayName} />
                  <span className="asset-card-body">
                    <span className="asset-card-heading"><strong>{asset.displayName}</strong><Icon name="chevron-right" /></span>
                    <span className="asset-card-summary">{asset.lastSummary ?? 'Waiting for an AI change summary.'}</span>
                    <span className="asset-card-meta"><span>{asset.versionCount} versions</span><span>{relativeTime(asset.lastCapturedAt)}</span></span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  )
}
