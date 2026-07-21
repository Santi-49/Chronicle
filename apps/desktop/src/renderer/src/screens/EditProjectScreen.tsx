import { Icon } from '../components/Icon'
import { useFolders } from '../lib/useChronicle'
import { NewProjectScreen } from './NewProjectScreen'

interface EditProjectScreenProps {
  projectId: number
  onCancel: () => void
  onSaved: (projectId: number) => void
}

/** Resolves an existing project, then reuses the New Project form in edit mode. */
export function EditProjectScreen({ projectId, onCancel, onSaved }: EditProjectScreenProps) {
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

  return <NewProjectScreen project={project} onCancel={onCancel} onCreated={onSaved} />
}
