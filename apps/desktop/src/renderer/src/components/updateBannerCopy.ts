import type { UpdateState } from '../../../shared/ipc'

export function updateBannerCopy(state: UpdateState): string | null {
  const version = state.availableVersion
  if (!version) return null
  if (state.phase === 'available') return `Chronicle ${version} is available. Download starting…`
  if (state.phase === 'downloading') return `Downloading Chronicle ${version}`
  if (state.phase === 'ready') return `Chronicle ${version} is ready to install.`
  return null
}
