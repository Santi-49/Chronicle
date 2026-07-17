import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { getProjectAssets, projects } from '../data/demoData'

interface HomeScreenProps {
  onAddProject: () => void
  onOpenProject: (projectId: string) => void
  onOpenVersion: (projectId: string, assetId: string, versionId: string) => void
  onViewProjects: () => void
}

export function HomeScreen({ onAddProject, onOpenProject, onOpenVersion, onViewProjects }: HomeScreenProps) {
  const recentChanges = projects.flatMap((project) =>
    getProjectAssets(project.id).map((asset) => ({ project, asset, version: asset.versions[0] }))
  ).slice(0, 5)

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
          <button className="text-button" onClick={onViewProjects} type="button">View all projects <Icon name="chevron-right" /></button>
        </div>
        <div className="project-card-grid">
          {projects.map((project) => {
            const projectAssets = getProjectAssets(project.id)
            const versionCount = projectAssets.reduce((total, asset) => total + asset.versions.length, 0)
            return (
              <button className="project-card" key={project.id} onClick={() => onOpenProject(project.id)} type="button">
                <span className="project-folder" style={{ color: project.color }}><Icon name={project.icon} /></span>
                <span className="project-card-copy">
                  <strong>{project.name}</strong>
                  <small>{project.path}</small>
                  <span>{projectAssets.length} {projectAssets.length === 1 ? 'asset' : 'assets'} · {versionCount} versions</span>
                </span>
                <span className="project-updated">{project.updatedAt}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="home-section" aria-labelledby="recent-changes-title">
        <div className="section-title-row">
          <div><p className="section-label">Across all projects</p><h2 id="recent-changes-title">Recent changes</h2></div>
        </div>
        <div className="activity-list">
          {recentChanges.map(({ project, asset, version }) => (
            <button
              className="activity-row"
              key={`${asset.id}-${version.id}`}
              onClick={() => onOpenVersion(project.id, asset.id, version.id)}
              type="button"
            >
              <AssetPreview variant={asset.variant} />
              <span className="activity-copy">
                <span><strong>{asset.name}</strong><small>Version {version.number}</small></span>
                <span>{version.summary}</span>
                <small>{project.name} · {version.createdAt}</small>
              </span>
              <Icon name="chevron-right" />
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}
