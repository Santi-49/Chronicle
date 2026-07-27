/**
 * Detection-only updates for platforms Chronicle cannot update in place (POST-08A).
 *
 * The macOS DMG is unsigned and unnotarized, so Squirrel.Mac — and therefore
 * `electron-updater`'s in-place install — cannot apply it. Instead of shipping a
 * broken auto-update, this controller reads the public GitHub release list, tells
 * the user a newer Chronicle exists, and opens the published installer in their
 * browser. The download and install stay entirely in the user's hands.
 *
 * Only release metadata is requested: no project, path, file, credential, or
 * account data is sent. GitHub still sees ordinary connection metadata.
 */
import type { UpdateState } from '../../shared/ipc'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { createPeriodicCheck, type UpdateController } from './shared'

/** The same public repository electron-builder publishes Windows updater assets to. */
export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/Santi-49/Chronicle/releases/latest'

export interface ManualUpdateControllerOptions {
  supported: boolean
  currentVersion: string
  /** `process.arch` — matched against the published `…-mac-<arch>.dmg` artifact name. */
  arch: string
  /** Fetches and parses the release JSON. Rejects on any transport or HTTP failure. */
  fetchJson: (url: string) => Promise<unknown>
  openExternal: (url: string) => Promise<void>
  emit: (state: UpdateState) => void
  diagnostic?: ApplicationDiagnosticSink
  now?: () => number
  initialDelayMs?: number
  intervalMs?: number
}

export interface PublishedRelease {
  version: string
  downloadUrl: string
}

/** Numeric-only comparison; `/releases/latest` never returns drafts or prereleases. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (value: string): number[] =>
    value.replace(/^v/i, '').split('-')[0]!.split('.')
      .map((part) => Number.parseInt(part, 10))
  const a = parts(candidate)
  const b = parts(current)
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false
  for (let index = 0; index < 3; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left > right
  }
  return false
}

/**
 * Reads the release fields Chronicle needs, preferring the DMG built for this
 * architecture and falling back to any DMG, then to the release page itself, so
 * a renamed or missing artifact still leaves the user somewhere useful.
 */
export function parseRelease(payload: unknown, arch: string): PublishedRelease | null {
  if (typeof payload !== 'object' || payload === null) return null
  const release = payload as {
    tag_name?: unknown
    draft?: unknown
    prerelease?: unknown
    html_url?: unknown
    assets?: unknown
  }
  if (release.draft === true || release.prerelease === true) return null
  if (typeof release.tag_name !== 'string' || release.tag_name.trim() === '') return null

  const assets = Array.isArray(release.assets) ? release.assets : []
  const installers = assets.flatMap((entry) => {
    const asset = entry as { name?: unknown; browser_download_url?: unknown }
    if (typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') return []
    if (!asset.name.toLowerCase().endsWith('.dmg')) return []
    if (!asset.browser_download_url.startsWith('https://')) return []
    return [{ name: asset.name, url: asset.browser_download_url }]
  })

  const preferred = installers.find((asset) => asset.name.includes(`-mac-${arch}.`))
  const fallbackPage =
    typeof release.html_url === 'string' && release.html_url.startsWith('https://')
      ? release.html_url
      : null
  const downloadUrl = (preferred ?? installers[0])?.url ?? fallbackPage
  if (!downloadUrl) return null

  return { version: release.tag_name.replace(/^v/i, ''), downloadUrl }
}

export function createManualUpdateController(
  options: ManualUpdateControllerOptions,
): UpdateController {
  const now = options.now ?? Date.now
  let state: UpdateState = {
    phase: options.supported ? 'idle' : 'unsupported',
    delivery: 'manual',
    currentVersion: options.currentVersion,
    availableVersion: null,
    percent: null,
    checkedAt: null,
    error: null,
  }
  let downloadUrl: string | null = null
  let checkPromise: Promise<UpdateState> | null = null

  const publish = (patch: Partial<UpdateState>): void => {
    state = { ...state, ...patch }
    options.emit({ ...state })
  }

  const recordFailure = (error: unknown): void => {
    const details = error as { name?: unknown; code?: unknown }
    options.diagnostic?.({
      level: 'warn',
      source: 'application',
      event: 'update_check_failed',
      message: 'The application update check could not be completed.',
      context: {
        operation: 'update_check',
        name: typeof details?.name === 'string' ? details.name.slice(0, 100) : 'Error',
        code: typeof details?.code === 'string' ? details.code.slice(0, 100) : null,
      },
    })
    // An already-detected release stays actionable: a later failed refresh must
    // not replace the card the user can still act on with an error.
    if (state.phase === 'available') {
      publish({ checkedAt: new Date(now()).toISOString() })
      return
    }
    publish({
      phase: 'idle',
      checkedAt: new Date(now()).toISOString(),
      error: 'Chronicle could not check for updates. Check your connection and try again.',
    })
  }

  const check = (): Promise<UpdateState> => {
    if (!options.supported) return Promise.resolve({ ...state })
    if (checkPromise) return checkPromise
    // Refresh quietly once a release is already offered, so a periodic check
    // never flickers the actionable card back to "Checking…".
    if (state.phase !== 'available') {
      publish({ phase: 'checking', error: null })
    }
    checkPromise = options.fetchJson(LATEST_RELEASE_URL)
      .then((payload) => {
        const release = parseRelease(payload, options.arch)
        const checkedAt = new Date(now()).toISOString()
        if (release && isNewerVersion(release.version, options.currentVersion)) {
          downloadUrl = release.downloadUrl
          publish({
            phase: 'available',
            availableVersion: release.version,
            percent: null,
            checkedAt,
            error: null,
          })
        } else {
          downloadUrl = null
          publish({
            phase: 'idle',
            availableVersion: null,
            percent: null,
            checkedAt,
            error: null,
          })
        }
        return { ...state }
      })
      .catch((error: unknown) => {
        recordFailure(error)
        return { ...state }
      })
      .finally(() => {
        checkPromise = null
      })
    return checkPromise
  }

  const periodic = createPeriodicCheck(() => void check(), options)

  return {
    getState: () => ({ ...state }),
    checkForUpdates: check,
    restartToUpdate(): Promise<void> {
      return Promise.reject(new Error('This build cannot install updates itself'))
    },
    async openDownload(): Promise<void> {
      if (!downloadUrl) throw new Error('No update download is available')
      await options.openExternal(downloadUrl)
    },
    start(): void {
      if (!options.supported) return
      periodic.start()
    },
    dispose(): void {
      periodic.stop()
    },
  }
}
