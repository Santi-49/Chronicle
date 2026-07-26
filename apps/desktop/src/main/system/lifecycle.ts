/**
 * Window/app lifecycle rules for background capture.
 *
 * Isolated from Electron on purpose. Two of these rules are the ones that go
 * wrong when close-to-tray is added to an app that previously quit on close,
 * and both fail *silently*:
 *
 *  1. **Quit must beat hide.** Once something has asked the app to exit — the
 *     tray's Quit item, `Cmd+Q`, the updater's `quitAndInstall`, an OS logout —
 *     a close event must no longer be swallowed. Miss this and the app becomes
 *     unquittable and "Restart to update" turns into "window disappears".
 *  2. **No tray means no hiding.** If the tray icon could not be created there
 *     is no way back to the window and no visible way out, so closing must
 *     quit exactly as it did before.
 *
 * `beginQuit()` is therefore one-way, and both predicates require an active
 * tray rather than merely the preference being on.
 */

export interface LifecycleOptions {
  /** C5 `system.runInBackground`, read live so a Settings change applies at once. */
  runInBackground: () => boolean
  /** Whether a tray icon actually exists right now. */
  trayActive: () => boolean
  platform?: NodeJS.Platform
}

export interface LifecycleController {
  /** Latches the quitting flag. Irreversible for the process's lifetime. */
  beginQuit(): void
  isQuitting(): boolean
  /** True when a window `close` should be turned into `hide()`. */
  shouldHideOnClose(): boolean
  /** True when losing the last window should end the process. */
  shouldQuitWhenAllWindowsClosed(): boolean
}

export function createLifecycleController(options: LifecycleOptions): LifecycleController {
  const platform = options.platform ?? process.platform
  let quitting = false

  const backgroundAvailable = (): boolean => options.runInBackground() && options.trayActive()

  return {
    beginQuit(): void {
      quitting = true
    },
    isQuitting: () => quitting,

    shouldHideOnClose: (): boolean => !quitting && backgroundAvailable(),

    shouldQuitWhenAllWindowsClosed: (): boolean => {
      // A quit already in progress ends the process on every platform. This is
      // belt-and-braces: `app.quit()` would finish on its own, but it means no
      // combination of states can leave a windowless process with no exit.
      if (quitting) return true
      // Otherwise macOS keeps an app alive without windows by platform
      // convention — which is also why closing the window there never stopped
      // capture, even before this feature existed.
      if (platform === 'darwin') return false
      return !backgroundAvailable()
    },
  }
}
