import { useEffect, useState } from 'react'
import { ThemeToggle } from './components/ThemeToggle'
import { HomeScreen } from './screens/HomeScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

export type Theme = 'dark' | 'light'
type Screen = 'welcome' | 'home'

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [theme, setTheme] = useState<Theme>(() => {
    return localStorage.getItem('chronicle-theme') === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('chronicle-theme', theme)
  }, [theme])

  return (
    <div className="app-frame">
      <div className="theme-control">
        <ThemeToggle
          theme={theme}
          onToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />
      </div>
      {screen === 'welcome' ? (
        <WelcomeScreen onContinue={() => setScreen('home')} />
      ) : (
        <HomeScreen />
      )}
    </div>
  )
}
