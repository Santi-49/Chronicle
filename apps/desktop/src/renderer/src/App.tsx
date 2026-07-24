import { useEffect, useLayoutEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { ThemeToggle } from './components/ThemeToggle'
import { WindowTitleBar } from './components/WindowTitleBar'
import { HomeScreen } from './screens/HomeScreen'
import { EditProjectScreen } from './screens/EditProjectScreen'
import { NewProjectScreen } from './screens/NewProjectScreen'
import { PendingJobsScreen } from './screens/PendingJobsScreen'
import { ProjectScreen } from './screens/ProjectScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { SearchScreen } from './screens/SearchScreen'
import { DiagnosticsScreen } from './screens/DiagnosticsScreen'
import { AdminScreen } from './screens/AdminScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TimelineScreen } from './screens/TimelineScreen'
import { VersionDetailsScreen } from './screens/VersionDetailsScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import type { AppRoute } from './types/navigation'
import { getPrimaryRoute } from './types/navigation'
import { chronicle } from './lib/bridge'
import { readDeveloperMode, writeDeveloperMode } from './lib/developerMode'
import type { AppearanceTheme } from '../../shared/settings'

export type Theme = 'dark' | 'light'
export type ThemePreference = AppearanceTheme

interface WorkspaceScreenProps {
  developmentBuild: boolean
  developerMode: boolean
  route: AppRoute
  themePreference: ThemePreference
  navigate: (route: AppRoute) => void
  onDeveloperModeChange: (enabled: boolean) => void
  onThemePreferenceChange: (preference: ThemePreference) => void
  onAdminStateChange: (isAdmin: boolean) => void
  onCloseJobs: () => void
}

function WorkspaceScreen({
  developmentBuild,
  developerMode,
  route,
  themePreference,
  navigate,
  onDeveloperModeChange,
  onThemePreferenceChange,
  onAdminStateChange,
  onCloseJobs,
}: WorkspaceScreenProps) {
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
    case 'edit-project':
      return (
        <EditProjectScreen
          projectId={route.projectId}
          onCancel={() => navigate({ name: 'project', projectId: route.projectId })}
          onRemoved={() => navigate({ name: 'projects' })}
          onSaved={(projectId) => navigate({ name: 'project', projectId })}
        />
      )
    case 'project':
      return (
        <ProjectScreen
          projectId={route.projectId}
          onBack={() => navigate({ name: 'projects' })}
          onEdit={() => navigate({ name: 'edit-project', projectId: route.projectId })}
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
          key={route.versionId}
          assetId={route.assetId}
          projectId={route.projectId}
          versionId={route.versionId}
          onBack={() => navigate({ name: 'timeline', assetId: route.assetId, projectId: route.projectId })}
          onOpenVersion={(versionId) =>
            navigate({ name: 'version', versionId, assetId: route.assetId, projectId: route.projectId })
          }
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
    case 'diagnostics':
      return <DiagnosticsScreen developmentBuild={developmentBuild} />
    case 'admin':
      return <AdminScreen />
    case 'settings':
      return (
        <SettingsScreen
          developerBuild={developmentBuild}
          developerMode={developerMode}
          themePreference={themePreference}
          onAddProject={() => navigate({ name: 'new-project' })}
          onDeveloperModeChange={onDeveloperModeChange}
          onThemePreferenceChange={onThemePreferenceChange}
          onAdminStateChange={onAdminStateChange}
        />
      )
    case 'jobs':
      return <PendingJobsScreen onBack={onCloseJobs} />
  }
}

const HAS_ONBOARDED_KEY = 'chronicle-has-onboarded'
const DEVELOPMENT_BUILD = import.meta.env.DEV

export default function App() {
  // After the first "Continue local" the welcome screen is skipped and returning
  // users land straight on Home.
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(
    () => localStorage.getItem(HAS_ONBOARDED_KEY) === 'true'
  )
  const [route, setRoute] = useState<AppRoute>({ name: 'home' })
  const [isAdmin, setIsAdmin] = useState(false)
  const [developerMode, setDeveloperMode] = useState(
    () => DEVELOPMENT_BUILD || readDeveloperMode(),
  )
  const [jobsReturnRoute, setJobsReturnRoute] = useState<AppRoute>({ name: 'home' })
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
    void chronicle.getSettings().then((settings) => setThemePreference(settings.appearance.theme))
    void chronicle.getAccountState().then((state) => setIsAdmin(state.isAdmin))
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('chronicle-theme-preference', themePreference)
    void window.chronicle
      .setWindowTheme(theme)
      .catch((error) => console.error('[chronicle] failed to theme native window controls:', error))
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

  useEffect(() => {
    if (!isAdmin && route.name === 'admin') setRoute({ name: 'home' })
  }, [isAdmin, route.name])

  const toggleTheme = () => {
    changeThemePreference(theme === 'dark' ? 'light' : 'dark')
  }

  const changeThemePreference = (preference: ThemePreference) => {
    setThemePreference(preference)
    void chronicle.updateSettings({ appearance: { theme: preference } })
  }

  const changeDeveloperMode = (enabled: boolean) => {
    if (DEVELOPMENT_BUILD) return
    writeDeveloperMode(enabled)
    setDeveloperMode(enabled)
    if (!enabled && route.name === 'diagnostics') setRoute({ name: 'settings' })
  }

  const openJobs = () => {
    if (route.name === 'jobs') return
    setJobsReturnRoute(route)
    setRoute({ name: 'jobs', from: getPrimaryRoute(route) })
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
            <WelcomeScreen
              onContinue={() => {
                localStorage.setItem(HAS_ONBOARDED_KEY, 'true')
                setHasEnteredWorkspace(true)
              }}
              onContinueGoogle={async () => {
                const state = await chronicle.loginWithGoogle()
                setIsAdmin(state.isAdmin)
                const synced = await chronicle.getSettings()
                setThemePreference(synced.appearance.theme)
                localStorage.setItem(HAS_ONBOARDED_KEY, 'true')
                setHasEnteredWorkspace(true)
              }}
            />
          </div>
        ) : (
          <AppShell
            developerMode={developerMode}
            isAdmin={isAdmin}
            route={route}
            onNavigate={setRoute}
            onOpenJobs={openJobs}
          >
            <div className="screen-transition" key={JSON.stringify(route)}>
              <WorkspaceScreen
                developmentBuild={DEVELOPMENT_BUILD}
                developerMode={developerMode}
                route={route}
                themePreference={themePreference}
                navigate={setRoute}
                onDeveloperModeChange={changeDeveloperMode}
                onThemePreferenceChange={changeThemePreference}
                onAdminStateChange={setIsAdmin}
                onCloseJobs={() => setRoute(jobsReturnRoute)}
              />
            </div>
          </AppShell>
        )}
      </div>
    </div>
  )
}
