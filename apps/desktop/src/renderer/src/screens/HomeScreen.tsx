import { AssetPreview } from '../components/AssetPreview'
import { FolderGlyph } from '../components/FolderGlyph'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import {
  assetsForFolder,
  folderForAsset,
  relativeTime,
  totalVersions,
  useAssets,
  useFolders,
} from '../lib/useChronicle'

interface HomeScreenProps {
  onAddProject: () => void
  onOpenProject: (projectId: number) => void
  onOpenAsset: (assetId: number, projectId?: number) => void
  onViewProjects: () => void
}

export function HomeScreen({ onAddProject, onOpenProject, onOpenAsset, onViewProjects }: HomeScreenProps) {
  const { folders } = useFolders()
  const { assets } = useAssets()

  const recentProjects = folders.slice(0, 6)
  const recentChanges = assets.slice(0, 5)

  return (
    <section className="page home-page" aria-labelledby="home-title">
      <PageHeader
        eyebrow="Workspace"
        title="Home"
        description="Pick up where you left off or review the latest changes Chronicle captured."
        actions={
          <button className="primary-button compact-button" onClick={onAddProject} type="button">
            <Icon name="folder-plus" />
            Add project
          </button>
        }
      />

      <section className="home-section" aria-labelledby="recent-projects-title">
        <div className="section-title-row">
          <div><p className="section-label">Tracked folders</p><h2 id="recent-projects-title">Recent projects</h2></div>
          {folders.length > 0 && (
            <button className="text-button" onClick={onViewProjects} type="button">View all projects <Icon name="chevron-right" /></button>
          )}
        </div>

        {folders.length === 0 ? (
          <div className="empty-state">
            <Icon name="folder-plus" />
            <h3>No folders tracked yet</h3>
            <p>Point Chronicle at a folder you work in. Every PNG or JPG you save there becomes a version automatically.</p>
            <button className="primary-button compact-button" onClick={onAddProject} type="button">
              <Icon name="folder-plus" /> Add your first project
            </button>
          </div>
        ) : (
          <div className="project-card-grid">
            {recentProjects.map((project) => {
              const projectAssets = assetsForFolder(project, assets)
              return (
                <button className="project-card" key={project.id} onClick={() => onOpenProject(project.id)} type="button">
                  <FolderGlyph icon={project.icon} color={project.color} />
                  <span className="project-card-copy">
                    <strong>{project.displayName}</strong>
                    {project.description && <p title={project.description}>{project.description}</p>}
                    <small>{project.path}</small>
                    <span>{projectAssets.length} {projectAssets.length === 1 ? 'asset' : 'assets'} · {totalVersions(projectAssets)} versions</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {recentChanges.length > 0 && (
        <section className="home-section" aria-labelledby="recent-changes-title">
          <div className="section-title-row">
            <div><p className="section-label">Across all projects</p><h2 id="recent-changes-title">Recent changes</h2></div>
          </div>
          <div className="activity-list">
            {recentChanges.map((asset) => (
              <button
                className="activity-row"
                key={asset.id}
                onClick={() => onOpenAsset(asset.id, folderForAsset(asset, folders)?.id)}
                type="button"
              >
                <AssetPreview src={asset.thumbnailUrl} alt={asset.displayName} />
                <span className="activity-copy">
                  <span><strong>{asset.displayName}</strong><small>{asset.versionCount} versions</small></span>
                  <span>{asset.lastSummary ?? 'Waiting for an AI change summary.'}</span>
                  <small>{relativeTime(asset.lastCapturedAt)}{asset.onDisk ? '' : ' · file no longer on disk'}</small>
                </span>
                <Icon name="chevron-right" />
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
