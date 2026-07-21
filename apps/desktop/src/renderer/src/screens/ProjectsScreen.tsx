import { FolderGlyph } from '../components/FolderGlyph'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { assetsForFolder, relativeTime, totalVersions, useAssets, useFolders } from '../lib/useChronicle'

interface ProjectsScreenProps {
  onAddProject: () => void
  onOpenProject: (projectId: number) => void
}

export function ProjectsScreen({ onAddProject, onOpenProject }: ProjectsScreenProps) {
  const { folders } = useFolders()
  const { assets } = useAssets()

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

      {folders.length === 0 ? (
        <div className="empty-state">
          <Icon name="folder-plus" />
          <h3>No projects yet</h3>
          <p>Add a folder to start capturing versions of the images you save inside it.</p>
          <button className="primary-button compact-button" onClick={onAddProject} type="button">
            <Icon name="folder-plus" /> Add a project
          </button>
        </div>
      ) : (
        <>
          <div className="project-list-heading">
            <span>{folders.length} {folders.length === 1 ? 'project' : 'projects'}</span>
          </div>
          <div className="project-list">
            {folders.map((project) => {
              const projectAssets = assetsForFolder(project, assets)
              const lastChange = projectAssets[0]?.lastCapturedAt ?? null
              return (
                <button className="project-list-row" key={project.id} onClick={() => onOpenProject(project.id)} type="button">
                  <FolderGlyph icon={project.icon} color={project.color} />
                  <span className="project-list-copy"><strong>{project.displayName}</strong><small>{project.path}</small></span>
                  <span className="project-stat"><strong>{projectAssets.length}</strong><small>Assets</small></span>
                  <span className="project-stat"><strong>{totalVersions(projectAssets)}</strong><small>Versions</small></span>
                  <span className="project-last-change"><small>Last change</small><span>{relativeTime(lastChange)}</span></span>
                  <Icon name="chevron-right" />
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
