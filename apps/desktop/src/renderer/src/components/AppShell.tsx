import type { ReactNode } from 'react'
import type { AppRoute, PrimaryRouteName } from '../types/navigation'
import { getPrimaryRoute } from '../types/navigation'
import { Icon, type IconName } from './Icon'
import { StatusBar } from './StatusBar'

interface AppShellProps {
  route: AppRoute
  children: ReactNode
  developerMode: boolean
  isAdmin: boolean
  onNavigate: (route: AppRoute) => void
  onOpenJobs: () => void
}

const primaryNavigation: { name: PrimaryRouteName; label: string; icon: IconName; developerOnly?: boolean; adminOnly?: boolean }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'projects', label: 'Projects', icon: 'folder' },
  { name: 'search', label: 'Search', icon: 'search' },
  { name: 'admin', label: 'Admin', icon: 'campaign', adminOnly: true },
  { name: 'diagnostics', label: 'Diagnostics', icon: 'terminal', developerOnly: true },
]

export function AppShell({ route, children, developerMode, isAdmin, onNavigate, onOpenJobs }: AppShellProps) {
  const activeRoute = getPrimaryRoute(route)
  const visibleNavigation = primaryNavigation.filter((item) =>
    (!item.developerOnly || developerMode) && (!item.adminOnly || isAdmin))

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="workspace-sidebar">
        <nav aria-label="Primary navigation">
          <ul>
            {visibleNavigation.map((item) => (
              <li key={item.name}>
                <button
                  aria-current={activeRoute === item.name ? 'page' : undefined}
                  className={activeRoute === item.name ? 'sidebar-link sidebar-link-active' : 'sidebar-link'}
                  onClick={() => onNavigate({ name: item.name })}
                  type="button"
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="sidebar-footer" aria-label="Application settings">
          <button
            aria-current={activeRoute === 'settings' ? 'page' : undefined}
            className={activeRoute === 'settings' ? 'sidebar-link sidebar-link-active' : 'sidebar-link'}
            onClick={() => onNavigate({ name: 'settings' })}
            type="button"
          >
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <p className="sidebar-version">Chronicle {__APP_VERSION__}</p>
        </nav>
      </aside>

      <div className="workspace-main">
        <div className="workspace-content" id="main-content" tabIndex={-1}>
          {children}
        </div>
        <StatusBar onOpenJobs={onOpenJobs} />
      </div>
    </div>
  )
}
