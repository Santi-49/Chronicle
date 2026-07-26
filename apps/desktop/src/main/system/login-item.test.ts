import { describe, expect, it, vi } from 'vitest'
import {
  createLoginItemController,
  HIDDEN_LAUNCH_ARG,
  LOGIN_ITEM_NAME,
  shouldStartHidden,
  type LoginItemAdapter,
} from './login-item'

/**
 * Fake shell modelled on Electron 43's *measured* Windows behavior, not on the
 * documented shape: one registry value per executable, `openAtLogin` always
 * false, and the registered arguments never returned by a query. A fake that
 * echoed the arguments back would hide the bug this module exists to work
 * around. `registeredArgs` is what the shell would actually launch.
 */
function fakeAdapter(): LoginItemAdapter & {
  present: boolean
  registeredArgs: string[] | null
  writes: unknown[]
} {
  return {
    present: false,
    registeredArgs: null,
    writes: [],
    getLoginItemSettings() {
      return { openAtLogin: false, executableWillLaunchAtLogin: this.present }
    },
    setLoginItemSettings(options) {
      this.writes.push(options)
      this.present = options.openAtLogin
      this.registeredArgs = options.openAtLogin ? (options.args ?? []) : null
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
    expect(controller.read()).toBe(false)
  })

  it('sees a registered entry that Windows reports only as executableWillLaunchAtLogin', () => {
    // The regression that shipped in 0.13.0: reading `openAtLogin` alone left
    // the checkbox permanently unchecked even with a live Run entry.
    const { controller } = setup()
    controller.write(true, 'background')
    expect(controller.read()).toBe(true)
  })

  it('does not narrow the query by the registered arguments', () => {
    // Windows does not return them, so matching on them reads a correctly
    // registered hidden launch back as absent.
    const { adapter, controller } = setup()
    controller.write(true, 'background')
    const query = vi.spyOn(adapter, 'getLoginItemSettings')
    controller.read()
    expect(query.mock.calls[0]?.[0]).not.toHaveProperty('args')
  })

  it('registers a hidden launch under an explicit name the uninstaller can delete', () => {
    const { adapter, controller } = setup()
    expect(controller.write(true, 'background')).toBe(true)
    expect(adapter.writes).toEqual([
      expect.objectContaining({
        openAtLogin: true,
        name: LOGIN_ITEM_NAME,
        args: [HIDDEN_LAUNCH_ARG],
      }),
    ])
    // What the shell will actually launch, whatever a later query can read.
    expect(adapter.registeredArgs).toEqual([HIDDEN_LAUNCH_ARG])
  })

  it('registers a window launch with no hidden argument', () => {
    const { adapter, controller } = setup()
    expect(controller.write(true, 'window')).toBe(true)
    expect(adapter.registeredArgs).toEqual([])
  })

  it('replaces the entry when the launch mode changes', () => {
    const { adapter, controller } = setup()
    controller.write(true, 'background')
    controller.write(true, 'window')
    // Two Run values would mean two Chronicles at sign-in.
    expect(adapter.writes).toHaveLength(2)
    expect(adapter.registeredArgs).toEqual([])
    expect(controller.read()).toBe(true)
  })

  it('removes the entry when disabled', () => {
    const { adapter, controller } = setup()
    controller.write(true, 'window')
    expect(controller.write(false, 'window')).toBe(false)
    expect(adapter.present).toBe(false)
  })

  it('reports what the operating system did, not what was requested', () => {
    // A managed device can accept the call and ignore it; the checkbox must
    // not claim a startup entry that does not exist.
    const adapter = fakeAdapter()
    adapter.setLoginItemSettings = vi.fn()
    const controller = createLoginItemController({ adapter, platform: 'win32', packaged: true })
    expect(controller.write(true, 'window')).toBe(false)
  })

  it('survives a shell that refuses the query', () => {
    const adapter = fakeAdapter()
    adapter.getLoginItemSettings = vi.fn(() => {
      throw new Error('registry unavailable')
    })
    const controller = createLoginItemController({ adapter, platform: 'win32', packaged: true })
    expect(controller.read()).toBe(false)
  })

  it('accepts the documented openAtLogin field on its own', () => {
    // macOS answers through openAtLogin; Windows through the other field.
    const adapter = fakeAdapter()
    adapter.getLoginItemSettings = () => ({ openAtLogin: true })
    const controller = createLoginItemController({ adapter, platform: 'darwin', packaged: true })
    expect(controller.read()).toBe(true)
  })

  it('is unsupported in development builds and never touches the shell', () => {
    // process.execPath is Electron's own binary under npm run dev.
    const { adapter, controller } = setup({ packaged: false })
    expect(controller.supported).toBe(false)
    expect(controller.unsupportedReason).toMatch(/installed app/)
    expect(controller.read()).toBe(false)
    expect(() => controller.write(true, 'window')).toThrow(/installed app/)
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
