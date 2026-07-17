export type PrimaryRouteName = 'home' | 'projects' | 'search' | 'settings'

export type AppRoute =
  | { name: 'home' }
  | { name: 'projects' }
  | { name: 'new-project' }
  | { name: 'project'; projectId: string }
  | { name: 'timeline'; projectId: string; assetId: string }
  | { name: 'version'; projectId: string; assetId: string; versionId: string }
  | { name: 'search' }
  | { name: 'settings' }

export function getPrimaryRoute(route: AppRoute): PrimaryRouteName {
  if (route.name === 'new-project' || route.name === 'project' || route.name === 'timeline' || route.name === 'version')
    return 'projects'
  return route.name
}
