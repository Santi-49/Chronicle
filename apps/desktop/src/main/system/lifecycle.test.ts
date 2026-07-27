/**
 * Lifecycle rules for background capture. These assertions exist because both
 * failure modes are silent: an app that cannot be quit, and an app that
 * disappears instead of restarting into an update.
 */
import { describe, expect, it } from 'vitest'
import { createLifecycleController } from './lifecycle'

function setup(options: { runInBackground?: boolean; trayActive?: boolean; platform?: NodeJS.Platform } = {}) {
  const state = {
    runInBackground: options.runInBackground ?? true,
    trayActive: options.trayActive ?? true,
  }
  const controller = createLifecycleController({
    runInBackground: () => state.runInBackground,
    trayActive: () => state.trayActive,
    platform: options.platform ?? 'win32',
  })
  return { controller, state }
}

describe('lifecycle controller', () => {
  it('hides on close while capturing in the background', () => {
    const { controller } = setup()
    expect(controller.shouldHideOnClose()).toBe(true)
    expect(controller.shouldQuitWhenAllWindowsClosed()).toBe(false)
  })

  it('quits on close when background capture is disabled', () => {
    const { controller } = setup({ runInBackground: false })
    expect(controller.shouldHideOnClose()).toBe(false)
    expect(controller.shouldQuitWhenAllWindowsClosed()).toBe(true)
  })

  it('quits on close when the tray icon could not be created', () => {
    // Otherwise the window would hide with no icon to restore or quit from.
    const { controller } = setup({ runInBackground: true, trayActive: false })
    expect(controller.shouldHideOnClose()).toBe(false)
    expect(controller.shouldQuitWhenAllWindowsClosed()).toBe(true)
  })

  it('stops swallowing closes once a quit has begun', () => {
    // The updater's quitAndInstall and the tray's Quit both land here: if a
    // close were still turned into a hide, the app could never exit.
    const { controller } = setup()
    controller.beginQuit()
    expect(controller.isQuitting()).toBe(true)
    expect(controller.shouldHideOnClose()).toBe(false)
    expect(controller.shouldQuitWhenAllWindowsClosed()).toBe(true)
  })

  it('keeps the quitting latch set', () => {
    const { controller } = setup()
    controller.beginQuit()
    controller.beginQuit()
    expect(controller.isQuitting()).toBe(true)
  })

  it('reacts to a live settings change without being recreated', () => {
    const { controller, state } = setup()
    expect(controller.shouldHideOnClose()).toBe(true)
    state.runInBackground = false
    expect(controller.shouldHideOnClose()).toBe(false)
  })

  it('never quits on macOS when the last window closes', () => {
    // Platform convention, and the reason closing the window there already
    // kept capture alive before this feature existed.
    const { controller } = setup({ platform: 'darwin', runInBackground: false, trayActive: false })
    expect(controller.shouldQuitWhenAllWindowsClosed()).toBe(false)
  })
})
