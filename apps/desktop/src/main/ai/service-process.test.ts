import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAiServiceLocation } from './service-process'

describe('AI service location', () => {
  it('uses repository Python in development', () => {
    const root = path.resolve('repository')
    const location = resolveAiServiceLocation(root)

    expect(location.args.slice(0, 3)).toEqual(['-m', 'uvicorn', 'chronicle_ai.main:app'])
    expect(location.cwd).toBe(path.join(root, 'services', 'ai'))
  })

  it('uses the bundled executable and prompt in an installed build', () => {
    const resources = path.resolve('resources')
    const location = resolveAiServiceLocation(path.resolve('unused'), resources)

    expect(location.command).toBe(path.join(resources, 'ai', 'chronicle-ai-sidecar.exe'))
    expect(location.args).toEqual([])
    expect(location.cwd).toBe(path.join(resources, 'ai'))
    expect(location.environment['CHRONICLE_PROMPT_PATH']).toBe(
      path.join(resources, 'ai', 'prompts', 'version-annotation.md'),
    )
  })
})
