/**
 * What the two update controllers have in common (POST-08A).
 *
 * Packaged Windows downloads and installs an update itself (`controller.ts`);
 * packaged macOS is unsigned, so it can only detect one and hand the published
 * installer to the browser (`manual.ts`). Both answer the same C1 surface and
 * both check on the same unobtrusive schedule.
 */
import type { UpdateState } from '../../shared/ipc'

export interface UpdateController {
  getState(): UpdateState
  /** Single-flighted; shared by the periodic check and Settings → Check now. */
  checkForUpdates(): Promise<UpdateState>
  /** Automatic delivery only. Rejects on manual-delivery platforms. */
  restartToUpdate(): Promise<void>
  /** Manual delivery only. Rejects on automatic-delivery platforms. */
  openDownload(): Promise<void>
  start(): void
  dispose(): void
}

export const DEFAULT_INITIAL_DELAY_MS = 10_000
export const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1_000

export interface PeriodicCheckOptions {
  initialDelayMs?: number
  intervalMs?: number
}

/**
 * Runs `check` once shortly after launch, then on a long interval. The first
 * check is delayed so a launch never competes with capture or window creation.
 */
export function createPeriodicCheck(
  check: () => void,
  options: PeriodicCheckOptions = {},
): { start(): void; stop(): void } {
  let initialTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let started = false

  return {
    start(): void {
      if (started) return
      started = true
      initialTimer = setTimeout(() => {
        initialTimer = null
        check()
      }, options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS)
      intervalTimer = setInterval(check, options.intervalMs ?? DEFAULT_INTERVAL_MS)
    },
    stop(): void {
      if (initialTimer) clearTimeout(initialTimer)
      if (intervalTimer) clearInterval(intervalTimer)
      initialTimer = null
      intervalTimer = null
    },
  }
}
