import { describe, expect, it, vi } from 'vitest'
import {
  createLoginItemController,
  HIDDEN_LAUNCH_ARG,
  LOGIN_ITEM_NAME,
  shouldStartHidden,
  type LoginItemAdapter,
} from './login-item'

/**
 * Fake shell registry keyed by the exact arguments a login item was registered
 * with — the same identity matching Windows and macOS perform, and what lets
 * the controller recover the launch mode without storing it.
 */
function fakeAdapter(): LoginItemAdapter & { entries: Map<string, boolean>; writes: unknown[] } {
  const entries = new Map<string, boolean>()
  const writes: unknown[] = []
  return {
    entries,
    writes,
    getLoginItemSettings(options) {
      return { openAtLogin: entries.get(JSON.stringify(options?.args ?? [])) ?? false }
    },
    setLoginItemSettings(options) {
      writes.push(options)
      // One named entry: a mode change replaces it rather than adding a second.
      entries.clear()
      if (options.openAtLogin) entries.set(JSON.stringify(options.args ?? []), true)
    },
  }
}

function setup(options: { platform?: NodeJS.Platform; packaged?: boolean } = {}) {
  const adapter = fakeAdapter()
  const controller = createLoginItemController({
    adapter,
    platform: options.platform ?? 'win32',
    packaged: options.packaged ?? true,
    execPath: 'C:\\Program Files\\Chronicle\\Chronicle.exe',
  })
  return { adapter, controller }
}

describe('login item controller', () => {
  it('starts disabled and reports support on packaged Windows', () => {
    const { controller } = setup()
    expect(controller.supported).toBe(true)
    expect(controller.unsupportedReason).toBeNull()
    expect(controller.read()).toEqual({ enabled: false, mode: 'background' })
  })

  it('registers a hidden launch under an explicit name the uninstaller can delete', () => {
    const { adapter, controller } = setup()
    expect(controller.write({ enabled: true, mode: 'background' })).toEqual({
      enabled: true,
      mode: 'background',
    })
    expect(adapter.writes).toEqual([
      expect.objectContaining({
        openAtLogin: true,
        name: LOGIN_ITEM_NAME,
        args: [HIDDEN_LAUNCH_ARG],
      }),
    ])
  })

  it('registers a window launch with no hidden argument', () => {
    const { adapter, controller } = setup()
    expect(controller.write({ enabled: true, mode: 'window' })).toEqual({
      enabled: true,
      mode: 'window',
    })
    expect(adapter.writes[0]).toMatchObject({ args: [] })
  })

  it('replaces the entry when the launch mode changes', () => {
    const { adapter, controller } = setup()
    controller.write({ enabled: true, mode: 'background' })
    controller.write({ enabled: true, mode: 'window' })
    // Two Run values would mean two Chronicles at sign-in.
    expect(adapter.entries.size).toBe(1)
    expect(controller.read()).toEqual({ enabled: true, mode: 'window' })
  })

  it('removes the entry when disabled', () => {
    const { adapter, controller } = setup()
    controller.write({ enabled: true, mode: 'window' })
    expect(controller.write({ enabled: false, mode: 'window' })).toEqual({
      enabled: false,
      mode: 'background',
    })
    expect(adapter.entries.size).toBe(0)
  })

  it('reports what the operating system did, not what was requested', () => {
    // A managed device can accept the call and ignore it; the checkbox must
    // not claim a startup entry that does not exist.
    const adapter = fakeAdapter()
    adapter.setLoginItemSettings = vi.fn()
    const controller = createLoginItemController({ adapter, platform: 'win32', packaged: true })
    expect(controller.write({ enabled: true, mode: 'window' })).toEqual({
      enabled: false,
      mode: 'background',
    })
  })

  it('survives a shell that refuses the query', () => {
    const adapter = fakeAdapter()
    adapter.getLoginItemSettings = vi.fn(() => {
      throw new Error('registry unavailable')
    })
    const controller = createLoginItemController({ adapter, platform: 'win32', packaged: true })
    expect(controller.read()).toEqual({ enabled: false, mode: 'background' })
  })

  it('is unsupported in development builds and never touches the shell', () => {
    // process.execPath is Electron's own binary under npm run dev.
    const { adapter, controller } = setup({ packaged: false })
    expect(controller.supported).toBe(false)
    expect(controller.unsupportedReason).toMatch(/installed app/)
    expect(controller.read()).toEqual({ enabled: false, mode: 'background' })
    expect(() => controller.write({ enabled: true, mode: 'window' })).toThrow(/installed app/)
    expect(adapter.writes).toEqual([])
  })

  it('is unsupported on platforms without a login-item API', () => {
    const { controller } = setup({ platform: 'linux' })
    expect(controller.supported).toBe(false)
    expect(controller.unsupportedReason).toMatch(/Windows and macOS/)
  })
})

describe('shouldStartHidden', () => {
  const base = { argv: ['chronicle.exe'], openedAtLogin: false, loginMode: 'background' as const, trayAvailable: true }

  it('starts hidden for our own login argument', () => {
    expect(shouldStartHidden({ ...base, argv: ['chronicle.exe', HIDDEN_LAUNCH_ARG] })).toBe(true)
  })

  it('starts hidden on a macOS login launch registered as background', () => {
    // macOS restores login items without arguments, so the mode decides.
    expect(shouldStartHidden({ ...base, openedAtLogin: true })).toBe(true)
  })

  it('shows the window on a macOS login launch registered as window', () => {
    expect(shouldStartHidden({ ...base, openedAtLogin: true, loginMode: 'window' })).toBe(false)
  })

  it('shows the window for an ordinary launch', () => {
    expect(shouldStartHidden(base)).toBe(false)
  })

  it('never starts hidden without a tray, even when asked to', () => {
    // Otherwise the user gets an invisible process they can neither open nor quit.
    expect(
      shouldStartHidden({
        ...base,
        argv: ['chronicle.exe', HIDDEN_LAUNCH_ARG],
        openedAtLogin: true,
        trayAvailable: false,
      }),
    ).toBe(false)
  })
})
