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
  delivery: 'automatic',
  currentVersion: '1.0.0',
  availableVersion: null,
  percent: null,
  checkedAt: null,
  error: null,
}

const manual: UpdateState = { ...base, delivery: 'manual' }

describe('updateBannerCopy', () => {
  it('stays hidden when no update is active', () => {
    expect(updateBannerCopy(base)).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'checking' })).toBeNull()
    expect(updateBannerCopy({ ...base, phase: 'unsupported' })).toBeNull()
    expect(updateBannerCopy({ ...manual, phase: 'checking' })).toBeNull()
  })

  it('uses one compact message while the update downloads', () => {
    expect(updateBannerCopy({
      ...base,
      phase: 'available',
      availableVersion: '1.1.0',
    })).toEqual({ action: 'progress', copy: 'Downloading update…' })
    expect(updateBannerCopy({
      ...base,
      phase: 'downloading',
      availableVersion: '1.1.0',
      percent: 48,
    })).toEqual({ action: 'progress', copy: 'Downloading update…' })
  })

  it('switches to the relaunch action after download', () => {
    expect(updateBannerCopy({
      ...base,
      phase: 'ready',
      availableVersion: '1.1.0',
      percent: 100,
    })).toEqual({ action: 'restart', copy: 'Relaunch to update' })
  })

  it('offers a download instead of a relaunch when delivery is manual', () => {
    expect(updateBannerCopy({
      ...manual,
      phase: 'available',
      availableVersion: '1.1.0',
    })).toEqual({ action: 'download', copy: 'Update available' })
  })

  it('never promises a manual build a download or install it cannot do', () => {
    // `available` is terminal for manual delivery: it can neither report download
    // progress nor reach `ready`, so those states must not render an action.
    expect(updateBannerCopy({
      ...manual,
      phase: 'downloading',
      availableVersion: '1.1.0',
      percent: 20,
    })).toBeNull()
    expect(updateBannerCopy({
      ...manual,
      phase: 'ready',
      availableVersion: '1.1.0',
    })).toBeNull()
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
