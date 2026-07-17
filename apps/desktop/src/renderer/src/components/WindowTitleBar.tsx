import { ChronicleMark } from './ChronicleMark'

export function WindowTitleBar() {
  const isMac = navigator.userAgent.includes('Macintosh')

  return (
    <header className={isMac ? 'window-titlebar window-titlebar-mac' : 'window-titlebar'}>
      <div className="window-titlebar-safe-area">
        <div className="window-titlebar-brand" aria-label="Chronicle">
          <ChronicleMark />
          <span>Chronicle</span>
        </div>
      </div>
    </header>
  )
}
