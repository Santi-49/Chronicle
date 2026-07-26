/**
 * Only the icon-variant rule is unit-tested here: the rest of the tray module
 * is Electron wiring (`new Tray`, menus, notifications) that cannot be
 * exercised without a running shell, and is covered by driving the built app.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { trayIconFile } from './tray'

describe('trayIconFile', () => {
  it('uses the dark-surface app icon on a dark notification area', () => {
    expect(trayIconFile(true)).toBe('chronicle-app-icon-dark.png')
  })

  it('uses the light-surface app icon on a light notification area', () => {
    // The light variant carries the darker #0043ce blues, so the mark keeps
    // contrast on a light taskbar instead of washing out.
    expect(trayIconFile(false)).toBe('chronicle-app-icon-light.png')
  })

  it('resolves names that exist in the rendered tray asset set', () => {
    // Guards the rename risk: a tray icon that silently fails to load leaves
    // an invisible tray entry, which is exactly the state this feature must
    // never reach.
    const root = path.resolve(__dirname, '../../../../../packages/brand/assets/png/tray')
    for (const dark of [true, false]) {
      expect(fs.existsSync(path.join(root, trayIconFile(dark)))).toBe(true)
      // Electron loads the HiDPI companion by convention, not by our code.
      expect(fs.existsSync(path.join(root, trayIconFile(dark).replace('.png', '@2x.png')))).toBe(true)
    }
  })
})
