import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  desktopAiServicePort,
  resolveAiServiceLocation,
  resolveDevelopmentPython,
} from './service-process'

describe('AI service location', () => {
  it('isolates workspace development from the installed app port', () => {
    expect(desktopAiServicePort(false, 12_345)).toBe(32_345)
    expect(desktopAiServicePort(false, 22_345)).toBe(22_345)
    expect(desktopAiServicePort(true)).toBe(8765)
  })

  it('uses repository Python in development', () => {
    const root = path.resolve('repository')
    const location = resolveAiServiceLocation(root)

    expect(location.args.slice(0, 3)).toEqual(['-m', 'uvicorn', 'chronicle_ai.main:app'])
    expect(location.cwd).toBe(path.join(root, 'services', 'ai'))
  })

  it('can auto-reload workspace source without changing packaged or probe processes', () => {
    const root = path.resolve('repository')
    expect(resolveAiServiceLocation(root, undefined, 'win32', 8766, true).args).toContain(
      '--reload',
    )
    expect(resolveAiServiceLocation(root, undefined, 'win32', 8877).args).not.toContain(
      '--reload',
    )
  })

  it('prefers the prepared workspace environment over system Python', () => {
    const root = path.resolve('repository')
    const expected = path.join(
      root,
      'apps',
      'desktop',
      'build',
      'sidecar-venv',
      'Scripts',
      'python.exe',
    )
    expect(resolveDevelopmentPython(root, 'win32', (candidate) => candidate === expected)).toBe(
      expected,
    )
  })

  it('uses the bundled Windows executable and prompt in an installed build', () => {
    const resources = path.resolve('resources')
    const location = resolveAiServiceLocation(path.resolve('unused'), resources, 'win32')

    expect(location.command).toBe(path.join(resources, 'ai', 'chronicle-ai-sidecar.exe'))
    expect(location.args).toEqual([])
    expect(location.cwd).toBe(path.join(resources, 'ai'))
    expect(location.environment['CHRONICLE_PROMPT_PATH']).toBe(
      path.join(resources, 'ai', 'prompts', 'version-annotation.md'),
    )
  })

  it('uses the extensionless bundled executable on macOS', () => {
    const resources = path.resolve('resources')
    const location = resolveAiServiceLocation(path.resolve('unused'), resources, 'darwin')

    expect(location.command).toBe(path.join(resources, 'ai', 'chronicle-ai-sidecar'))
    expect(location.cwd).toBe(path.join(resources, 'ai'))
  })

  it('can isolate a developer probe on a different loopback port', () => {
    const location = resolveAiServiceLocation(
      path.resolve('repository'),
      undefined,
      'win32',
      8877,
    )

    expect(location.args).toContain('8877')
  })
})
