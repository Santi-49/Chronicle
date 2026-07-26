import type { UpdateState } from '../../shared/ipc'
import type { ApplicationDiagnosticSink } from '../diagnostics'

type UpdateInfoLike = { version: string }
type DownloadProgressLike = { percent: number }
type UpdaterEvent =
  | 'error'
  | 'checking-for-update'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'update-cancelled'

export interface UpdaterAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowDowngrade: boolean
  allowPrerelease: boolean
  on(event: UpdaterEvent, listener: (...args: unknown[]) => void): unknown
  removeListener(event: UpdaterEvent, listener: (...args: unknown[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateController {
  getState(): UpdateState
  checkForUpdates(): Promise<UpdateState>
  restartToUpdate(): Promise<void>
  start(): void
  dispose(): void
}

interface UpdateControllerOptions {
  supported: boolean
  currentVersion: string
  updater: UpdaterAdapter
  emit: (state: UpdateState) => void
  diagnostic?: ApplicationDiagnosticSink
  now?: () => number
  initialDelayMs?: number
  intervalMs?: number
}

const DEFAULT_INITIAL_DELAY_MS = 10_000
const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1_000

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const now = options.now ?? Date.now
  let state: UpdateState = {
    phase: options.supported ? 'idle' : 'unsupported',
    currentVersion: options.currentVersion,
    availableVersion: null,
    percent: null,
    checkedAt: null,
    error: null,
  }
  let checkPromise: Promise<UpdateState> | null = null
  let initialTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let started = false
  let restartStarted = false
  let lastProgressAt = 0
  let lastProgressPercent = -1

  const publish = (patch: Partial<UpdateState>): void => {
    state = { ...state, ...patch }
    options.emit({ ...state })
  }

  const checkedAt = (): string => new Date(now()).toISOString()

  const recordFailure = (phase: UpdateState['phase'], error: unknown): void => {
    const downloadFailure = phase === 'available' || phase === 'downloading'
    const errorRecord = error as { name?: unknown; code?: unknown }
    options.diagnostic?.({
      level: downloadFailure ? 'error' : 'warn',
      source: 'application',
      event: downloadFailure ? 'update_download_failed' : 'update_check_failed',
      message: downloadFailure
        ? 'The application update could not be downloaded.'
        : 'The application update check could not be completed.',
      context: {
        operation: downloadFailure ? 'update_download' : 'update_check',
        name: typeof errorRecord?.name === 'string' ? errorRecord.name.slice(0, 100) : 'Error',
        code: typeof errorRecord?.code === 'string' ? errorRecord.code.slice(0, 100) : null,
      },
    })
    publish({
      phase: 'idle',
      percent: null,
      checkedAt: checkedAt(),
      error: downloadFailure
        ? 'The update could not be downloaded. Check your connection and try again.'
        : 'Chronicle could not check for updates. Check your connection and try again.',
    })
  }

  const listeners: Record<UpdaterEvent, (...args: unknown[]) => void> = {
    'checking-for-update': () => {
      publish({ phase: 'checking', percent: null, error: null })
    },
    'update-available': (value) => {
      const info = value as UpdateInfoLike
      publish({
        phase: 'available',
        availableVersion: info.version,
        percent: 0,
        checkedAt: checkedAt(),
        error: null,
      })
    },
    'update-not-available': () => {
      publish({
        phase: 'idle',
        availableVersion: null,
        percent: null,
        checkedAt: checkedAt(),
        error: null,
      })
    },
    'download-progress': (value) => {
      const progress = value as DownloadProgressLike
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
      const timestamp = now()
      if (
        percent !== 100 &&
        percent < lastProgressPercent + 1 &&
        timestamp - lastProgressAt < 500
      ) {
        return
      }
      lastProgressAt = timestamp
      lastProgressPercent = percent
      publish({ phase: 'downloading', percent, error: null })
    },
    'update-downloaded': (value) => {
      const info = value as UpdateInfoLike
      publish({
        phase: 'ready',
        availableVersion: info.version || state.availableVersion,
        percent: 100,
        error: null,
      })
    },
    'update-cancelled': () => {
      publish({
        phase: 'idle',
        availableVersion: null,
        percent: null,
        error: 'The update download was cancelled. Check again when you are ready.',
      })
    },
    error: (value) => {
      recordFailure(state.phase, value)
    },
  }

  if (options.supported) {
    options.updater.autoDownload = true
    options.updater.autoInstallOnAppQuit = false
    options.updater.allowDowngrade = false
    options.updater.allowPrerelease = false
    for (const [event, listener] of Object.entries(listeners) as Array<
      [UpdaterEvent, (...args: unknown[]) => void]
    >) {
      options.updater.on(event, listener)
    }
  }

  const check = (): Promise<UpdateState> => {
    if (!options.supported) return Promise.resolve({ ...state })
    if (checkPromise) return checkPromise
    // Once a release is being downloaded (or is ready), a periodic/manual check
    // must not replace that actionable state with `checking`.
    if (
      state.phase === 'available'
      || state.phase === 'downloading'
      || state.phase === 'ready'
    ) {
      return Promise.resolve({ ...state })
    }
    publish({ phase: 'checking', percent: null, error: null })
    checkPromise = options.updater.checkForUpdates()
      .then(() => {
        if (state.phase === 'checking') {
          publish({ phase: 'idle', checkedAt: checkedAt(), error: null })
        }
        return { ...state }
      })
      .catch((error: unknown) => {
        if (state.phase !== 'idle' || state.error === null) {
          recordFailure(state.phase, error)
        }
        return { ...state }
      })
      .finally(() => {
        checkPromise = null
      })
    return checkPromise
  }

  return {
    getState: () => ({ ...state }),
    checkForUpdates: check,
    async restartToUpdate(): Promise<void> {
      if (!options.supported || state.phase !== 'ready') {
        throw new Error('No downloaded update is ready to install')
      }
      if (restartStarted) return
      restartStarted = true
      options.updater.quitAndInstall(true, true)
    },
    start(): void {
      if (!options.supported || started) return
      started = true
      initialTimer = setTimeout(() => {
        initialTimer = null
        void check()
      }, options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS)
      intervalTimer = setInterval(() => {
        void check()
      }, options.intervalMs ?? DEFAULT_INTERVAL_MS)
    },
    dispose(): void {
      if (initialTimer) clearTimeout(initialTimer)
      if (intervalTimer) clearInterval(intervalTimer)
      initialTimer = null
      intervalTimer = null
      for (const [event, listener] of Object.entries(listeners) as Array<
        [UpdaterEvent, (...args: unknown[]) => void]
      >) {
        options.updater.removeListener(event, listener)
      }
    },
  }
}
