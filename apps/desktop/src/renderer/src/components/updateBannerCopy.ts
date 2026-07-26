import type { UpdateState } from '../../../shared/ipc'

export const IGNORED_UPDATE_VERSION_KEY = 'chronicle-ignored-update-version'

export function updateBannerCopy(state: UpdateState): string | null {
  return state.phase === 'ready' && state.availableVersion ? 'Update ready' : null
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
