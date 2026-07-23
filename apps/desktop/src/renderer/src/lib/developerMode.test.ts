import { describe, expect, it } from 'vitest'
import { readDeveloperMode, writeDeveloperMode } from './developerMode'

describe('developer mode preference', () => {
  it('is disabled unless explicitly stored', () => {
    expect(readDeveloperMode({ getItem: () => null })).toBe(false)
    expect(readDeveloperMode({ getItem: () => 'false' })).toBe(false)
    expect(readDeveloperMode({ getItem: () => 'true' })).toBe(true)
  })

  it('stores an explicit boolean value', () => {
    let saved = ''
    writeDeveloperMode(true, { setItem: (_key, value) => { saved = value } })
    expect(saved).toBe('true')
  })
})

