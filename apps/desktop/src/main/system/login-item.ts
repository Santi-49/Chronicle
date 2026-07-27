/**
 * Login item ("start Chronicle when I sign in") — the small amount of real
 * logic around Electron's `app.{get,set}LoginItemSettings`.
 *
 * Electron is injected as an adapter so this module stays testable: the rules
 * below are the part worth asserting, not the platform call.
 *
 * Three deliberate decisions:
 *
 *  - **The OS is the only source of truth.** Nothing is mirrored into C5.
 *    A user can remove the login item from Task Manager or System Settings
 *    while Chronicle is not running, so a stored boolean would silently drift
 *    and show a preference the system had already discarded.
 *  - **Development builds are unsupported.** `process.execPath` is Electron's
 *    own binary during `npm run dev`, so registering it would add a startup
 *    entry that launches a bare Electron instead of Chronicle — and leave it
 *    behind after the checkout moves. Same `app.isPackaged` gate the updater
 *    uses.
 *  - **Two launch modes, one entry.** Starting at login and *opening the
 *    window* at login are separate user choices, encoded in the registered
 *    arguments: `background` passes `--hidden` and resumes capture in the tray,
 *    `window` registers no argument and restores the UI. Both use the same
 *    login-item name, so switching mode replaces the entry instead of leaving
 *    two behind.
 */

/** Argument that tells a login launch to start in the tray with no window. */
export const HIDDEN_LAUNCH_ARG = '--hidden'

/**
 * Explicit registry/launch-agent name. Electron would default to the app name,
 * but naming it here means the NSIS uninstaller can delete a known
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value rather than
 * guessing what the running build called itself.
 */
export const LOGIN_ITEM_NAME = 'Chronicle'

/** `background` = tray only (no window); `window` = restore the UI as well. */
export type LoginLaunchMode = 'background' | 'window'

/**
 * What Electron reports back about the login item.
 *
 * Measured on Windows (Electron 43) against a real registered entry, because
 * the documented field is not the one that works there:
 *
 *   registry: Chronicle = "…\Chronicle.exe" --hidden
 *   getLoginItemSettings({ path, args: ['--hidden'] })
 *     → openAtLogin: false                    ← compares against process.execPath only
 *       executableWillLaunchAtLogin: true     ← the field that actually answers the question
 *       launchItems: [{ name: 'Chronicle', args: [] }]   ← registered args are NOT returned
 *
 * Two consequences drive the code below. `openAtLogin` alone reports a live
 * entry as absent, so both fields are OR-ed. And because the registered
 * arguments do not survive the round trip, the launch *mode* cannot be
 * recovered from the shell on Windows — it is remembered in C5 instead, while
 * the OS remains authoritative for whether the entry exists at all.
 */
export interface LoginItemReading {
  openAtLogin: boolean
  executableWillLaunchAtLogin?: boolean
}

/** The slice of Electron's `app` this module needs. */
export interface LoginItemAdapter {
  getLoginItemSettings(options?: { path?: string; args?: string[] }): LoginItemReading
  setLoginItemSettings(options: {
    openAtLogin: boolean
    name?: string
    path?: string
    args?: string[]
    enabled?: boolean
  }): void
}

export interface LoginItemController {
  /** True when this build/platform can register a login item at all. */
  readonly supported: boolean
  /** Why it cannot; null when supported. */
  readonly unsupportedReason: string | null
  /** Re-reads the operating system: is this executable registered to launch at login? */
  read(): boolean
  /** Applies the preference and returns the re-read OS answer. Throws when unsupported. */
  write(enabled: boolean, mode: LoginLaunchMode): boolean
}

export interface LoginItemOptions {
  adapter: LoginItemAdapter
  platform: NodeJS.Platform
  packaged: boolean
  /** Executable to register; defaults to the running one. */
  execPath?: string
}

export function createLoginItemController(options: LoginItemOptions): LoginItemController {
  const platformSupported = options.platform === 'win32' || options.platform === 'darwin'
  const unsupportedReason = !platformSupported
    ? 'Starting at login is available on Windows and macOS.'
    : !options.packaged
      ? 'Starting at login is available in the installed app.'
      : null
  const supported = unsupportedReason === null

  const argsFor = (mode: LoginLaunchMode): string[] =>
    mode === 'background' ? [HIDDEN_LAUNCH_ARG] : []

  const read = (): boolean => {
    if (!supported) return false
    try {
      // Queried with defaults — meaning "this executable". Passing the
      // registered arguments would *narrow* the match, and on Windows those
      // arguments are not returned by the query, so a correctly registered
      // hidden launch would read back as absent (see LoginItemReading).
      const reading = options.adapter.getLoginItemSettings(
        options.execPath === undefined ? undefined : { path: options.execPath },
      )
      return reading.openAtLogin || reading.executableWillLaunchAtLogin === true
    } catch {
      // A shell that refuses the query must not break the Settings screen.
      return false
    }
  }

  return {
    supported,
    unsupportedReason,
    read,
    write(enabled: boolean, mode: LoginLaunchMode): boolean {
      if (!supported) {
        throw new Error(unsupportedReason ?? 'Starting at login is not supported in this build')
      }
      options.adapter.setLoginItemSettings({
        openAtLogin: enabled,
        name: LOGIN_ITEM_NAME,
        enabled,
        ...(options.execPath === undefined ? {} : { path: options.execPath }),
        // The registered command line is what actually decides how Windows and
        // macOS launch Chronicle, whatever the query can read back afterwards.
        args: argsFor(mode),
      })
      // Report what the OS now says rather than what we asked for: a managed
      // device can refuse the write, and the checkbox must not lie.
      return read()
    },
  }
}

/**
 * True when this process was launched to sit in the tray instead of opening a
 * window.
 *
 * Two signals, because the platforms differ: Windows passes the argument we
 * registered, while macOS restores a login item without arguments and reports
 * `wasOpenedAtLogin` instead — so there, the registered *mode* is what says
 * whether a window was wanted.
 *
 * `trayAvailable` is the safety rule: with background capture switched off
 * there is no tray to reach, so a hidden launch would leave an invisible
 * process the user could neither open nor quit. Such a launch shows its window.
 */
export function shouldStartHidden(options: {
  argv: readonly string[]
  openedAtLogin: boolean
  loginMode: LoginLaunchMode
  trayAvailable: boolean
}): boolean {
  if (!options.trayAvailable) return false
  if (options.argv.includes(HIDDEN_LAUNCH_ARG)) return true
  return options.openedAtLogin && options.loginMode === 'background'
}
