import { describe, expect, it } from 'vitest'
import type { UpdateState } from '../../../shared/ipc'
import { updateBannerCopy } from './updateBannerCopy'

const base: UpdateState = {
  phase: 'idle',
  currentVersion: '1.0.0',
  availableVersion: null,
  percent: null,
  checkedAt: null,
  error: null,
}

describe('updateBannerCopy', () => {
  it('stays hidden for unsupported, idle, and checking states', () => {
    expect(updateBannerCopy(base)).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'checking' })).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'unsupported' })).toBeNull()
  })

  it('names the available version through download and restart', () => {
    const available = { ...base, phase: 'available', availableVersion: '1.1.0' } as const
    expect(updateBannerCopy(available)).toContain('1.1.0')
    expect(updateBannerCopy({ ...available, phase: 'downloading', percent: 48 })).toContain('1.1.0')
    expect(updateBannerCopy({ ...available, phase: 'ready', percent: 100 })).toContain('ready')
  })
})
