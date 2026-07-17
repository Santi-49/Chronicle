import type { Theme } from '../App'
import { Icon } from './Icon'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      aria-label={`Switch to ${nextTheme} theme`}
      className="theme-toggle"
      onClick={onToggle}
      title={`Switch to ${nextTheme} theme`}
      type="button"
    >
      <Icon name={theme === 'dark' ? 'theme-light' : 'theme-dark'} />
    </button>
  )
}
