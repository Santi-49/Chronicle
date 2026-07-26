import { describe, expect, it } from 'vitest'
import type { UpdateState } from '../../../shared/ipc'
import {
  IGNORED_UPDATE_VERSION_KEY,
  ignoreUpdateVersion,
  readIgnoredUpdateVersion,
  updateBannerCopy,
} from './updateBannerCopy'

const base: UpdateState = {
  phase: 'idle',
  currentVersion: '1.0.0',
  availableVersion: null,
  percent: null,
  checkedAt: null,
  error: null,
}

describe('updateBannerCopy', () => {
  it('stays hidden until the update is ready to install', () => {
    expect(updateBannerCopy(base)).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'checking' })).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'unsupported' })).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'available', availableVersion: '1.1.0' })).toBeNull()
    expect(updateBannerCopy({
      ...base,
      phase: 'downloading',
      availableVersion: '1.1.0',
      percent: 48,
    })).toBeNull()
  })

  it('shows only a compact ready message after download', () => {
    expect(updateBannerCopy({
      ...base,
      phase: 'ready',
      availableVersion: '1.1.0',
      percent: 100,
    })).toBe('Update ready')
  })

  it('persists the version selected with Ignore', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    expect(readIgnoredUpdateVersion(storage)).toBeNull()
    ignoreUpdateVersion('1.1.0', storage)
    expect(values.get(IGNORED_UPDATE_VERSION_KEY)).toBe('1.1.0')
    expect(readIgnoredUpdateVersion(storage)).toBe('1.1.0')
  })
})
