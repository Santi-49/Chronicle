import { useState } from 'react'
import type { AssetSummary } from '../../../shared/ipc'
import { AssetPreview } from '../components/AssetPreview'
import { assetSummaryFallback } from '../lib/aiStatus'
import { FolderGlyph } from '../components/FolderGlyph'
import { Icon } from '../components/Icon'
import { RemovedFilesPanel } from '../components/RemovedFilesPanel'
import {
  readProjectViewMode,
  writeProjectViewMode,
  type ProjectViewMode,
} from '../lib/projectView'
import {
  assetsForFolder,
  browseFolder,
  relativeTime,
  totalVersions,
  useAssets,
  useFolders,
} from '../lib/useChronicle'

/** How many assets the "Recently changed" block shows (a 2×2 block). */
const RECENT_COUNT = 4

interface ProjectScreenProps {
  projectId: number
  onBack: () => void
  onEdit: () => void
  onOpenAsset: (assetId: number) => void
}

export function ProjectScreen({ projectId, onBack, onEdit, onOpenAsset }: ProjectScreenProps) {
  const { folders, loading: foldersLoading } = useFolders()
  const { assets } = useAssets()
  const [viewMode, setViewMode] = useState<ProjectViewMode>(() => readProjectViewMode())
  // Segments below the project root, e.g. ['brand', 'logos']. [] is the root.
  const [folderPath, setFolderPath] = useState<string[]>([])

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
  // Files that left the disk keep their history, but they are not part of the
  // work in progress — they live in the removed section instead (F3.7).
  const presentAssets = projectAssets.filter((asset) => asset.onDisk)
  const removedAssets = projectAssets
    .filter((asset) => !asset.onDisk)
    .sort((a, b) => (b.missingSince ?? '').localeCompare(a.missingSince ?? ''))
  const recent = [...presentAssets]
    .sort((a, b) => b.lastCapturedAt.localeCompare(a.lastCapturedAt))
    .slice(0, RECENT_COUNT)
  const { folders: childFolders, files } = browseFolder(project, presentAssets, folderPath)

  const changeView = (mode: ProjectViewMode) => {
    setViewMode(mode)
    writeProjectViewMode(mode)
  }

  return (
    <section className="page project-page" aria-labelledby="project-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onBack} type="button">Projects</button>
        <Icon name="chevron-right" />
        {folderPath.length === 0 ? (
          <span aria-current="page">{project.displayName}</span>
        ) : (
          <button onClick={() => setFolderPath([])} type="button">{project.displayName}</button>
        )}
        {folderPath.map((segment, index) => (
          <span className="breadcrumb-segment" key={`${segment}-${index}`}>
            <Icon name="chevron-right" />
            {index === folderPath.length - 1 ? (
              <span aria-current="page">{segment}</span>
            ) : (
              <button onClick={() => setFolderPath(folderPath.slice(0, index + 1))} type="button">
                {segment}
              </button>
            )}
          </span>
        ))}
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
        <div><strong>{presentAssets.length}</strong><span>Assets</span></div>
        <div><strong>{totalVersions(presentAssets)}</strong><span>Versions stored</span></div>
        <div><strong>{relativeTime(recent[0]?.lastCapturedAt ?? null)}</strong><span>Last change</span></div>
      </div>

      {projectAssets.length === 0 ? (
        <div className="empty-state" data-tour="project-empty">
          <Icon name="image" />
          <h3>No versions captured yet</h3>
          <p>Save a supported creative file inside this folder and it will appear here within seconds.</p>
        </div>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="project-recent" aria-labelledby="project-recent-title">
              <div className="section-title-row">
                <div>
                  <p className="section-label">Recently changed</p>
                  <h2 id="project-recent-title">Last {recent.length === 1 ? 'change' : `${recent.length} changes`}</h2>
                </div>
              </div>
              <div className="asset-grid asset-grid-recent">
                {recent.map((asset) => (
                  <AssetCard asset={asset} key={asset.id} onOpen={onOpenAsset} />
                ))}
              </div>
            </section>
          )}

          <section className="project-files" aria-labelledby="project-files-title">
            <div className="section-title-row">
              <div>
                <p className="section-label">
                  {folderPath.length === 0 ? 'Project root' : folderPath.join(' / ')}
                </p>
                <h2 id="project-files-title">Files</h2>
              </div>
              <div className="view-toggle" role="group" aria-label="File layout">
                <button
                  aria-pressed={viewMode === 'gallery'}
                  className={viewMode === 'gallery' ? 'view-toggle-button active' : 'view-toggle-button'}
                  onClick={() => changeView('gallery')}
                  type="button"
                >
                  <Icon name="grid-view" />
                  Gallery
                </button>
                <button
                  aria-pressed={viewMode === 'list'}
                  className={viewMode === 'list' ? 'view-toggle-button active' : 'view-toggle-button'}
                  onClick={() => changeView('list')}
                  type="button"
                >
                  <Icon name="list-view" />
                  List
                </button>
              </div>
            </div>

            {(childFolders.length > 0 || folderPath.length > 0) && (
              <ul className="folder-browser">
                {folderPath.length > 0 && (
                  <li>
                    <button
                      className="folder-browser-row"
                      onClick={() => setFolderPath(folderPath.slice(0, -1))}
                      type="button"
                    >
                      <Icon name="arrow-left" />
                      <span className="folder-browser-name">Back to {folderPath.length === 1 ? project.displayName : folderPath[folderPath.length - 2]}</span>
                    </button>
                  </li>
                )}
                {childFolders.map((folder) => (
                  <li key={folder.name}>
                    <button
                      className="folder-browser-row"
                      onClick={() => setFolderPath(folder.segments)}
                      type="button"
                    >
                      <Icon name="folder" />
                      <span className="folder-browser-name">{folder.name}</span>
                      <span className="folder-browser-meta">
                        {folder.assetCount} {folder.assetCount === 1 ? 'file' : 'files'}
                      </span>
                      <span className="folder-browser-meta">{relativeTime(folder.lastCapturedAt)}</span>
                      <Icon name="chevron-right" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {files.length === 0 ? (
              <p className="folder-browser-empty">
                {childFolders.length > 0
                  ? 'No files directly in this folder. Open a subfolder above.'
                  : 'No captured files in this folder yet.'}
              </p>
            ) : viewMode === 'gallery' ? (
              <div className="asset-grid">
                {files.map((asset) => (
                  <AssetCard asset={asset} key={asset.id} onOpen={onOpenAsset} />
                ))}
              </div>
            ) : (
              <ul className="asset-list">
                {files.map((asset) => (
                  <li key={asset.id}>
                    <button
                      className="asset-list-row"
                      data-tour="open-asset"
                      onClick={() => onOpenAsset(asset.id)}
                      type="button"
                    >
                      <AssetPreview src={asset.thumbnailUrl} alt={asset.displayName} format={asset.format} />
                      <span className="asset-list-body">
                        <strong>{asset.displayName}</strong>
                        <span className="asset-list-summary">
                          {asset.lastSummary ?? assetSummaryFallback(asset)}
                        </span>
                      </span>
                      <span className="asset-list-meta">
                        <span>{asset.versionCount} versions</span>
                        <span>{relativeTime(asset.lastCapturedAt)}</span>
                      </span>
                      <Icon name="chevron-right" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <RemovedFilesPanel assets={removedAssets} onOpenAsset={onOpenAsset} />
        </>
      )}
    </section>
  )
}

function AssetCard({
  asset,
  onOpen,
}: {
  asset: AssetSummary
  onOpen: (assetId: number) => void
}) {
  return (
    <button className="asset-card" data-tour="open-asset" onClick={() => onOpen(asset.id)} type="button">
      <AssetPreview src={asset.thumbnailUrl} alt={asset.displayName} format={asset.format} />
      <span className="asset-card-body">
        <span className="asset-card-heading">
          <strong>{asset.displayName}</strong>
          <Icon name="chevron-right" />
        </span>
        <span className="asset-card-summary">{asset.lastSummary ?? assetSummaryFallback(asset)}</span>
        <span className="asset-card-meta">
          <span>{asset.versionCount} versions</span>
          <span>{relativeTime(asset.lastCapturedAt)}</span>
        </span>
      </span>
    </button>
  )
}
