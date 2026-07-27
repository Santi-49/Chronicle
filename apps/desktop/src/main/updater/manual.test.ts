import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../../shared/ipc'
import {
  createManualUpdateController,
  isNewerVersion,
  LATEST_RELEASE_URL,
  parseRelease,
} from './manual'

function release(version: string, assetNames: string[] = [`Chronicle-${version}-mac-arm64.dmg`]) {
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/Santi-49/Chronicle/releases/tag/v${version}`,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url: `https://github.com/Santi-49/Chronicle/releases/download/v${version}/${name}`,
    })),
  }
}

function setup(supported = true) {
  const emitted: UpdateState[] = []
  const diagnostic = vi.fn()
  const openExternal = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve())
  const fetchJson = vi.fn<(url: string) => Promise<unknown>>(() =>
    Promise.resolve(release('1.3.0')))
  const controller = createManualUpdateController({
    supported,
    currentVersion: '1.2.3',
    arch: 'arm64',
    fetchJson,
    openExternal,
    emit: (state) => emitted.push(state),
    diagnostic,
    now: () => Date.parse('2026-07-27T12:00:00.000Z'),
  })
  return { controller, diagnostic, emitted, fetchJson, openExternal }
}

describe('isNewerVersion', () => {
  it('compares release numbers, not strings', () => {
    expect(isNewerVersion('v1.10.0', '1.9.0')).toBe(true)
    expect(isNewerVersion('0.15.0', '0.14.0')).toBe(true)
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false)
  })

  it('refuses to offer an update it cannot parse', () => {
    expect(isNewerVersion('nightly', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.3.0', 'unknown')).toBe(false)
  })
})

describe('parseRelease', () => {
  it('prefers the DMG built for this architecture', () => {
    const parsed = parseRelease(
      release('1.3.0', ['Chronicle-1.3.0-mac-x64.dmg', 'Chronicle-1.3.0-mac-arm64.dmg']),
      'arm64',
    )
    expect(parsed).toEqual({
      version: '1.3.0',
      downloadUrl: expect.stringContaining('Chronicle-1.3.0-mac-arm64.dmg'),
    })
  })

  it('falls back to another DMG, then to the release page', () => {
    expect(parseRelease(release('1.3.0', ['Chronicle-1.3.0-mac-x64.dmg']), 'arm64')?.downloadUrl)
      .toContain('mac-x64.dmg')
    expect(parseRelease(release('1.3.0', ['Chronicle-Setup-1.3.0.exe']), 'arm64')?.downloadUrl)
      .toBe('https://github.com/Santi-49/Chronicle/releases/tag/v1.3.0')
  })

  it('rejects drafts, prereleases, and malformed payloads', () => {
    expect(parseRelease({ ...release('1.3.0'), draft: true }, 'arm64')).toBeNull()
    expect(parseRelease({ ...release('1.3.0'), prerelease: true }, 'arm64')).toBeNull()
    expect(parseRelease({ ...release('1.3.0'), tag_name: '' }, 'arm64')).toBeNull()
    expect(parseRelease({ assets: [], html_url: 'https://x.test' }, 'arm64')).toBeNull()
    expect(parseRelease(null, 'arm64')).toBeNull()
  })

  it('ignores assets served over anything but HTTPS', () => {
    const insecure = {
      ...release('1.3.0', []),
      html_url: 'http://github.test/releases',
      assets: [{ name: 'Chronicle-1.3.0-mac-arm64.dmg', browser_download_url: 'http://x.test/a.dmg' }],
    }
    expect(parseRelease(insecure, 'arm64')).toBeNull()
  })
})

describe('manual update controller', () => {
  it('stays inert on unsupported builds', async () => {
    const { controller, emitted, fetchJson } = setup(false)

    expect(controller.getState()).toMatchObject({
      phase: 'unsupported',
      delivery: 'manual',
      currentVersion: '1.2.3',
    })
    await controller.checkForUpdates()

    expect(fetchJson).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('detects a newer release and opens its installer in the browser', async () => {
    const { controller, fetchJson, openExternal } = setup()

    const state = await controller.checkForUpdates()

    expect(fetchJson).toHaveBeenCalledWith(LATEST_RELEASE_URL)
    expect(state).toMatchObject({
      phase: 'available',
      delivery: 'manual',
      availableVersion: '1.3.0',
      percent: null,
      checkedAt: '2026-07-27T12:00:00.000Z',
      error: null,
    })

    await controller.openDownload()
    expect(openExternal).toHaveBeenCalledWith(
      expect.stringContaining('Chronicle-1.3.0-mac-arm64.dmg'),
    )
  })

  it('never installs an update itself, and has nothing to open until one is found', async () => {
    const { controller, openExternal } = setup()

    await expect(controller.restartToUpdate()).rejects.toThrow(/cannot install updates itself/)
    await expect(controller.openDownload()).rejects.toThrow(/No update download/)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('reports an equal or older published release as up to date', async () => {
    const { controller, fetchJson } = setup()
    fetchJson.mockResolvedValue(release('1.2.3'))

    const state = await controller.checkForUpdates()

    expect(state).toMatchObject({ phase: 'idle', availableVersion: null, error: null })
    await expect(controller.openDownload()).rejects.toThrow(/No update download/)
  })

  it('single-flights concurrent checks', async () => {
    const { controller, fetchJson } = setup()
    let resolveFetch!: (value: unknown) => void
    fetchJson.mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))

    const first = controller.checkForUpdates()
    const second = controller.checkForUpdates()
    resolveFetch(release('1.3.0'))
    await Promise.all([first, second])

    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('turns network failures into sanitized recoverable state and diagnostics', async () => {
    const { controller, diagnostic, fetchJson } = setup()
    fetchJson.mockRejectedValue(Object.assign(
      new Error('secret URL https://example.invalid/token'),
      { code: 'ENOTFOUND' },
    ))

    const state = await controller.checkForUpdates()

    expect(state).toMatchObject({
      phase: 'idle',
      error: 'Chronicle could not check for updates. Check your connection and try again.',
    })
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      event: 'update_check_failed',
      context: expect.objectContaining({ code: 'ENOTFOUND' }),
    }))
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('example.invalid')
  })

  it('keeps an offered release actionable when a later refresh fails', async () => {
    const { controller, diagnostic, emitted, fetchJson } = setup()
    await controller.checkForUpdates()
    fetchJson.mockRejectedValue(new Error('offline'))

    const state = await controller.checkForUpdates()

    // No `checking` flicker and no error copy over an action the user can still take.
    expect(emitted.map((entry) => entry.phase)).toEqual(['checking', 'available', 'available'])
    expect(state).toMatchObject({ phase: 'available', availableVersion: '1.3.0', error: null })
    expect(diagnostic).toHaveBeenCalledTimes(1)
    await controller.openDownload()
  })
})
