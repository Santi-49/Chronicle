/** How a project's files are laid out: large previews or a compact list. */
export type ProjectViewMode = 'gallery' | 'list'

const PROJECT_VIEW_KEY = 'chronicle-project-view'

export function readProjectViewMode(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ProjectViewMode {
  return storage.getItem(PROJECT_VIEW_KEY) === 'list' ? 'list' : 'gallery'
}

export function writeProjectViewMode(
  mode: ProjectViewMode,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(PROJECT_VIEW_KEY, mode)
}
