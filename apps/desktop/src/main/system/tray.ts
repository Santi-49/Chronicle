/**
 * Tray icon — the surface that makes background capture visible and quittable.
 *
 * Chronicle's watcher, capture pipeline, and AI queue already run in the main
 * process independently of any window, so background capture is a lifecycle
 * concern rather than a capture change. The tray exists so that state is
 * *honest*: a process that keeps watching folders after its window is gone
 * must remain visible and must offer an explicit way out.
 *
 * The icon is Chronicle's own app-icon artwork, in colour: the tray is where
 * users look for a running app, so it should be recognisably the same mark the
 * taskbar and window show rather than a separate monochrome glyph. The brand
 * set already ships light- and dark-surface variants (the light one uses the
 * darker `#0043ce` blues), so the shell's current tone picks the variant with
 * adequate contrast, and the icon is re-set when that tone changes.
 */
import { Menu, nativeImage, nativeTheme, Notification, Tray } from 'electron'
import path from 'node:path'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'

/**
 * Tray icon file for the shell's current tone, relative to the tray asset root.
 *
 * `dark` and `light` name the *surface the icon sits on*, matching the brand
 * asset names — a dark notification area takes the dark-surface variant.
 */
export function trayIconFile(darkShell: boolean): string {
  return darkShell ? 'chronicle-app-icon-dark.png' : 'chronicle-app-icon-light.png'
}

export interface TrayControllerOptions {
  /** Directory holding the rendered tray PNGs (with their `@2x` companions). */
  iconRoot: string
  /** Reveals and focuses the main window, creating one if none exists. */
  showWindow: () => void
  /** Real application exit — must set the quitting flag before `app.quit()`. */
  quit: () => void
  platform?: NodeJS.Platform
  diagnostic?: ApplicationDiagnosticSink
}

export interface TrayController {
  active(): boolean
  /** Idempotent; a second call does not create a second icon. */
  enable(): void
  /** Removes the icon. Capture is unaffected — only the surface goes away. */
  disable(): void
  /**
   * One-time "still running" notice, shown the first time a close is turned
   * into a hide. Without it, closing the window looks like quitting and the
   * still-present process reads as a bug.
   */
  notifyRunningInBackground(): void
  dispose(): void
}

export function createTrayController(options: TrayControllerOptions): TrayController {
  const platform = options.platform ?? process.platform
  let tray: Tray | null = null

  const iconPath = (): string =>
    path.join(options.iconRoot, trayIconFile(nativeTheme.shouldUseDarkColors))

  // Following the system tone is the whole reason two variants exist, so the
  // image is re-set whenever that tone changes while Chronicle is resident.
  const onThemeUpdated = (): void => {
    tray?.setImage(nativeImage.createFromPath(iconPath()))
  }

  const buildMenu = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Open Chronicle', click: () => options.showWindow() },
      { type: 'separator' },
      // Capture stopping is the consequence users need spelled out here: this
      // is the only control that ends background versioning.
      { label: 'Quit Chronicle (stops capturing)', click: () => options.quit() },
    ])

  return {
    active: () => tray !== null,

    enable(): void {
      if (tray) return
      try {
        tray = new Tray(nativeImage.createFromPath(iconPath()))
        tray.setToolTip('Chronicle is watching your folders')
        tray.setContextMenu(buildMenu())
        // Windows/Linux: a plain click is the expected "restore" gesture.
        // macOS leaves click to the menu, which is that platform's convention.
        if (platform !== 'darwin') tray.on('click', () => options.showWindow())
        nativeTheme.on('updated', onThemeUpdated)
      } catch (error) {
        tray = null
        // A shell with no notification area must not take the app down; the
        // caller falls back to quit-on-close so the app stays quittable.
        options.diagnostic?.({
          level: 'warn',
          source: 'application',
          event: 'tray_unavailable',
          message: 'Chronicle could not create a tray icon; closing the window will quit instead.',
          context: { error: diagnosticError(error) },
        })
      }
    },

    disable(): void {
      if (!tray) return
      nativeTheme.off('updated', onThemeUpdated)
      tray.destroy()
      tray = null
    },

    notifyRunningInBackground(): void {
      if (!Notification.isSupported()) return
      new Notification({
        title: 'Chronicle is still running',
        body: 'Your folders are still being versioned. Open or quit Chronicle from the tray icon.',
        silent: true,
      }).show()
    },

    dispose(): void {
      this.disable()
    },
  }
}
