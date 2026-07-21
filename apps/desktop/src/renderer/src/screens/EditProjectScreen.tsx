import { Icon } from '../components/Icon'
import { ProjectRemovalControl } from '../components/ProjectRemovalControl'
import { useFolders } from '../lib/useChronicle'
import { NewProjectScreen } from './NewProjectScreen'

interface EditProjectScreenProps {
  projectId: number
  onCancel: () => void
  onSaved: (projectId: number) => void
  onRemoved: () => void
}

/** Resolves an existing project, then reuses the New Project form in edit mode. */
export function EditProjectScreen({ projectId, onCancel, onSaved, onRemoved }: EditProjectScreenProps) {
  const { folders, loading, error } = useFolders()
  const project = folders.find((folder) => folder.id === projectId)

  if (!project) {
    return (
      <section className="page new-project-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <button onClick={onCancel} type="button">Projects</button>
          <Icon name="chevron-right" />
          <span aria-current="page">Edit project</span>
        </nav>
        <div className="empty-state">
          <Icon name="info" />
          <h3>{loading ? 'Loading project…' : 'Project not found'}</h3>
          {!loading && <p>{error ?? 'This folder is no longer tracked.'}</p>}
        </div>
      </section>
    )
  }

  return (
    <NewProjectScreen
      footer={
        <section className="project-danger-zone" aria-labelledby="project-danger-title">
          <div>
            <p className="section-label">Danger zone</p>
            <h2 id="project-danger-title">Remove this project</h2>
            <p>Stop watching this folder without deleting Chronicle’s stored version history.</p>
          </div>
          <ProjectRemovalControl
            onRemoved={onRemoved}
            projectId={project.id}
            projectName={project.displayName}
          />
        </section>
      }
      project={project}
      onCancel={onCancel}
      onCreated={onSaved}
    />
  )
}
