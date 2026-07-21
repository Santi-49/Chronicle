import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { ThemeToggle } from './components/ThemeToggle'
import { WindowTitleBar } from './components/WindowTitleBar'
import { HomeScreen } from './screens/HomeScreen'
import { NewProjectScreen } from './screens/NewProjectScreen'
import { ProjectScreen } from './screens/ProjectScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TimelineScreen } from './screens/TimelineScreen'
import { VersionDetailsScreen } from './screens/VersionDetailsScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import type { AppRoute } from './types/navigation'

export type Theme = 'dark' | 'light'
export type ThemePreference = Theme | 'system'

interface WorkspaceScreenProps {
  route: AppRoute
  themePreference: ThemePreference
  navigate: (route: AppRoute) => void
  onThemePreferenceChange: (preference: ThemePreference) => void
}

function WorkspaceScreen({ route, themePreference, navigate, onThemePreferenceChange }: WorkspaceScreenProps) {
  switch (route.name) {
    case 'home':
      return (
        <HomeScreen
          onAddProject={() => navigate({ name: 'new-project' })}
          onOpenProject={(projectId) => navigate({ name: 'project', projectId })}
          onOpenAsset={(assetId, projectId) => navigate({ name: 'timeline', assetId, projectId })}
          onViewProjects={() => navigate({ name: 'projects' })}
        />
      )
    case 'projects':
      return (
        <ProjectsScreen
          onAddProject={() => navigate({ name: 'new-project' })}
          onOpenProject={(projectId) => navigate({ name: 'project', projectId })}
        />
      )
    case 'new-project':
      return (
        <NewProjectScreen
          onCancel={() => navigate({ name: 'projects' })}
          onCreated={(projectId) => navigate({ name: 'project', projectId })}
        />
      )
    case 'project':
      return (
        <ProjectScreen
          projectId={route.projectId}
          onBack={() => navigate({ name: 'projects' })}
          onOpenAsset={(assetId) => navigate({ name: 'timeline', assetId, projectId: route.projectId })}
        />
      )
    case 'timeline':
      return (
        <TimelineScreen
          assetId={route.assetId}
          projectId={route.projectId}
          onBack={(projectId) =>
            projectId === undefined ? navigate({ name: 'projects' }) : navigate({ name: 'project', projectId })
          }
          onOpenProjects={() => navigate({ name: 'projects' })}
          onOpenVersion={(versionId) =>
            navigate({ name: 'version', versionId, assetId: route.assetId, projectId: route.projectId })
          }
        />
      )
    case 'version':
      return (
        <VersionDetailsScreen
          assetId={route.assetId}
          projectId={route.projectId}
          versionId={route.versionId}
          onBack={() => navigate({ name: 'timeline', assetId: route.assetId, projectId: route.projectId })}
          onOpenProject={(projectId) =>
            projectId === undefined ? navigate({ name: 'projects' }) : navigate({ name: 'project', projectId })
          }
          onOpenProjects={() => navigate({ name: 'projects' })}
        />
      )
    case 'search':
      return (
        <SearchScreen
          onOpenVersion={(assetId, versionId) => navigate({ name: 'version', versionId, assetId })}
        />
      )
    case 'settings':
      return (
        <SettingsScreen
          themePreference={themePreference}
          onAddProject={() => navigate({ name: 'new-project' })}
          onThemePreferenceChange={onThemePreferenceChange}
        />
      )
  }
}

export default function App() {
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false)
  const [route, setRoute] = useState<AppRoute>({ name: 'home' })
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    // 'chronicle-theme' (pre-"system" builds) is intentionally ignored so System is the default.
    const saved = localStorage.getItem('chronicle-theme-preference')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  )
  const theme = themePreference === 'system' ? systemTheme : themePreference

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('chronicle-theme-preference', themePreference)
  }, [theme, themePreference])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'light' : 'dark')
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!hasEnteredWorkspace) return

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setRoute({ name: 'search' })
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [hasEnteredWorkspace])

  useEffect(() => {
    if (!hasEnteredWorkspace) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hasEnteredWorkspace, route])

  const toggleTheme = () => {
    setThemePreference(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="window-layout">
      <WindowTitleBar />
      <div className="window-body">
        {!hasEnteredWorkspace ? (
          <div className="app-frame">
            <div className="theme-control">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
            <WelcomeScreen onContinue={() => setHasEnteredWorkspace(true)} />
          </div>
        ) : (
          <AppShell route={route} onNavigate={setRoute}>
            <div className="screen-transition" key={JSON.stringify(route)}>
              <WorkspaceScreen
                route={route}
                themePreference={themePreference}
                navigate={setRoute}
                onThemePreferenceChange={setThemePreference}
              />
            </div>
          </AppShell>
        )}
      </div>
    </div>
  )
}
