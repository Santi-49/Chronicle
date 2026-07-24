export type PrimaryRouteName = 'home' | 'projects' | 'search' | 'admin' | 'diagnostics' | 'settings'

/**
 * IDs are the C1 numeric identifiers (folder id, asset id, version id).
 * `projectId` (the tracked-folder id) is optional on asset-scoped routes: when
 * absent, the screen derives the owning folder from the asset's path so search
 * and activity links don't need to know it up front.
 */
export type AppRoute =
  | { name: 'home' }
  | { name: 'projects' }
  | { name: 'new-project' }
  | { name: 'edit-project'; projectId: number }
  | { name: 'project'; projectId: number }
  | { name: 'timeline'; assetId: number; projectId?: number }
  | { name: 'version'; versionId: number; assetId: number; projectId?: number }
  | { name: 'search' }
  | { name: 'admin' }
  | { name: 'diagnostics' }
  | { name: 'settings' }
  | { name: 'jobs'; from: PrimaryRouteName }

export function getPrimaryRoute(route: AppRoute): PrimaryRouteName {
  if (route.name === 'jobs') return route.from
  if (route.name === 'new-project' || route.name === 'edit-project' || route.name === 'project' || route.name === 'timeline' || route.name === 'version')
    return 'projects'
  return route.name
}
