import { BrandLockup, ChronicleMark } from '../components/ChronicleMark'

export function HomeScreen() {
  return (
    <main className="home-screen">
      <aside className="home-sidebar">
        <BrandLockup />

        <nav aria-label="Primary navigation">
          <div className="nav-item nav-item-active" aria-current="page">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18" />
            </svg>
            Assets
          </div>
        </nav>

      </aside>

      <section className="home-content" aria-labelledby="home-title">
        <header className="home-header">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1 id="home-title">Assets</h1>
          </div>
        </header>

        <div className="home-empty-state">
          <div className="empty-icon">
            <ChronicleMark />
          </div>
          <h2>Welcome to Chronicle</h2>
          <p>Your local creative history will appear here.</p>
        </div>
      </section>
    </main>
  )
}
