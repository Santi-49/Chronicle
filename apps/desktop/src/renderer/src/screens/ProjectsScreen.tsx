import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { getProjectAssets, projects } from '../data/demoData'

interface ProjectsScreenProps {
  onAddProject: () => void
  onOpenProject: (projectId: string) => void
}

export function ProjectsScreen({ onAddProject, onOpenProject }: ProjectsScreenProps) {
  return (
    <section className="page projects-page" aria-labelledby="projects-title">
      <PageHeader
        eyebrow="Tracked folders"
        title="Projects"
        description="Each project is a local folder Chronicle watches for creative file changes."
        actions={
          <button className="primary-button compact-button" onClick={onAddProject} type="button">
            <Icon name="folder-plus" />
            Add project
          </button>
        }
      />

      <div className="project-list-heading">
        <span>{projects.length} projects</span>
        <span>Most recently changed</span>
      </div>
      <div className="project-list">
        {projects.map((project) => {
          const projectAssets = getProjectAssets(project.id)
          const versionCount = projectAssets.reduce((total, asset) => total + asset.versions.length, 0)
          return (
            <button className="project-list-row" key={project.id} onClick={() => onOpenProject(project.id)} type="button">
              <span className="project-folder" style={{ color: project.color }}><Icon name={project.icon} /></span>
              <span className="project-list-copy"><strong>{project.name}</strong><small>{project.path}</small></span>
              <span className="project-stat"><strong>{projectAssets.length}</strong><small>Assets</small></span>
              <span className="project-stat"><strong>{versionCount}</strong><small>Versions</small></span>
              <span className="project-last-change"><small>Last change</small><span>{project.updatedAt}</span></span>
              <Icon name="chevron-right" />
            </button>
          )
        })}
      </div>
    </section>
  )
}
