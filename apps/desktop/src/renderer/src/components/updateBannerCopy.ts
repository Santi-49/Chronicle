import type { UpdateState } from '../../../shared/ipc'

export const IGNORED_UPDATE_VERSION_KEY = 'chronicle-ignored-update-version'

/**
 * What the compact notice offers, if anything.
 * - `progress` — the update is downloading itself; nothing to do yet (Windows).
 * - `restart` — downloaded and waiting for a relaunch (Windows).
 * - `download` — detected only; the user fetches the installer (macOS, unsigned).
 */
export type UpdateBannerAction = 'progress' | 'restart' | 'download'

export interface UpdateBannerPresentation {
  action: UpdateBannerAction
  copy: string
}

export function updateBannerCopy(state: UpdateState): UpdateBannerPresentation | null {
  if (!state.availableVersion) return null
  if (state.delivery === 'manual') {
    return state.phase === 'available'
      ? { action: 'download', copy: 'Update available' }
      : null
  }
  if (state.phase === 'available' || state.phase === 'downloading') {
    return { action: 'progress', copy: 'Downloading update…' }
  }
  if (state.phase === 'ready') return { action: 'restart', copy: 'Relaunch to update' }
  return null
}

export function readIgnoredUpdateVersion(
  storage: Pick<Storage, 'getItem'> = localStorage,
): string | null {
  return storage.getItem(IGNORED_UPDATE_VERSION_KEY)
}

export function ignoreUpdateVersion(
  version: string,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(IGNORED_UPDATE_VERSION_KEY, version)
}
