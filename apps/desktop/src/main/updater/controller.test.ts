import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../../shared/ipc'
import {
  createUpdateController,
  type UpdaterAdapter,
} from './controller'

class FakeUpdater extends EventEmitter implements UpdaterAdapter {
  autoDownload = false
  autoInstallOnAppQuit = true
  allowDowngrade = true
  allowPrerelease = true
  check = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null))
  install = vi.fn()

  checkForUpdates(): Promise<unknown> {
    return this.check()
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.install(isSilent, isForceRunAfter)
  }
}

function setup(supported = true) {
  const updater = new FakeUpdater()
  const emitted: UpdateState[] = []
  const diagnostic = vi.fn()
  const controller = createUpdateController({
    supported,
    currentVersion: '1.2.3',
    updater,
    emit: (state) => emitted.push(state),
    diagnostic,
    now: () => Date.parse('2026-07-26T12:00:00.000Z'),
  })
  return { controller, diagnostic, emitted, updater }
}

describe('update controller', () => {
  it('stays inert on unsupported builds', async () => {
    const { controller, emitted, updater } = setup(false)

    expect(controller.getState()).toMatchObject({
      phase: 'unsupported',
      delivery: 'automatic',
      currentVersion: '1.2.3',
    })
    await controller.checkForUpdates()

    expect(updater.check).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('rejects the manual-delivery download action', async () => {
    const { controller } = setup()
    await expect(controller.openDownload()).rejects.toThrow(/installs updates itself/)
  })

  it('configures safe stable-channel behavior and single-flights checks', async () => {
    const { controller, updater } = setup()
    let resolveCheck!: () => void
    updater.check.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCheck = resolve
    }))

    const first = controller.checkForUpdates()
    const second = controller.checkForUpdates()

    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowDowngrade).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(updater.check).toHaveBeenCalledTimes(1)

    resolveCheck()
    await Promise.all([first, second])
    expect(controller.getState()).toMatchObject({
      phase: 'idle',
      checkedAt: '2026-07-26T12:00:00.000Z',
    })
  })

  it('publishes download progress and installs only after ready', async () => {
    const { controller, updater } = setup()

    updater.emit('update-available', { version: '1.3.0' })
    updater.emit('download-progress', { percent: 42.4 })
    expect(controller.getState()).toMatchObject({
      phase: 'downloading',
      availableVersion: '1.3.0',
      percent: 42,
    })
    await expect(controller.restartToUpdate()).rejects.toThrow(/No downloaded update/)

    updater.emit('update-downloaded', { version: '1.3.0' })
    await controller.restartToUpdate()
    await controller.restartToUpdate()

    expect(updater.install).toHaveBeenCalledTimes(1)
    expect(updater.install).toHaveBeenCalledWith(true, true)
  })

  it('does not let later checks replace an active download or ready update', async () => {
    const { controller, updater } = setup()

    updater.emit('update-available', { version: '1.3.0' })
    await controller.checkForUpdates()
    expect(updater.check).not.toHaveBeenCalled()
    expect(controller.getState().phase).toBe('available')

    updater.emit('download-progress', { percent: 25 })
    await controller.checkForUpdates()
    expect(updater.check).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({ phase: 'downloading', percent: 25 })

    updater.emit('update-downloaded', { version: '1.3.0' })
    await controller.checkForUpdates()
    expect(updater.check).not.toHaveBeenCalled()
    expect(controller.getState().phase).toBe('ready')
  })

  it('turns network failures into sanitized recoverable state and diagnostics', async () => {
    const { controller, diagnostic, updater } = setup()
    const failure = Object.assign(new Error('secret URL https://example.invalid/token'), {
      code: 'ENOTFOUND',
    })
    updater.check.mockRejectedValue(failure)

    const result = await controller.checkForUpdates()

    expect(result).toMatchObject({
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

  it('removes updater listeners when disposed', () => {
    const { controller, emitted, updater } = setup()
    controller.dispose()

    updater.emit('update-available', { version: '2.0.0' })
    expect(emitted).toEqual([])
  })
})
