import { describe, expect, it } from 'vitest'
import { LANDING_BASE_URL } from './legalAcceptance'
import { HELP_CENTER_URL, UPDATE_HELP_URL } from './helpLinks'

describe('help links', () => {
  it('derives help pages from the configured landing site', () => {
    expect(HELP_CENTER_URL).toBe(`${LANDING_BASE_URL}/help/`)
    expect(UPDATE_HELP_URL).toBe(`${LANDING_BASE_URL}/help/troubleshooting/updates/`)
  })
})
