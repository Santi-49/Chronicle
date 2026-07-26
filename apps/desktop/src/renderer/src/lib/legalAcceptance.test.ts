import { describe, expect, it } from 'vitest'
import {
  LEGAL_ACCEPTANCE_STORAGE_KEY,
  LANDING_BASE_URL,
  PRIVACY_URL,
  PRIVACY_VERSION,
  TERMS_URL,
  TERMS_VERSION,
  hasCurrentLegalAcceptance,
  recordLegalAcceptance,
} from './legalAcceptance'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: (key: string) => (key === LEGAL_ACCEPTANCE_STORAGE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === LEGAL_ACCEPTANCE_STORAGE_KEY) value = next
    },
    value: () => value,
  }
}

describe('legal acceptance', () => {
  it('derives legal pages from the configured landing base URL', () => {
    expect(TERMS_URL).toBe(`${LANDING_BASE_URL}/terms-and-services/`)
    expect(PRIVACY_URL).toBe(`${LANDING_BASE_URL}/privacy/`)
  })

  it('records the policy versions, method, and timestamp', () => {
    const storage = memoryStorage()
    const acceptedAt = new Date('2026-07-26T12:00:00.000Z')

    expect(recordLegalAcceptance(storage, 'local', acceptedAt)).toEqual({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: acceptedAt.toISOString(),
      method: 'local',
    })
    expect(hasCurrentLegalAcceptance(storage)).toBe(true)
  })

  it('rejects missing, malformed, or superseded records', () => {
    expect(hasCurrentLegalAcceptance(memoryStorage())).toBe(false)
    expect(hasCurrentLegalAcceptance(memoryStorage('{bad'))).toBe(false)
    expect(hasCurrentLegalAcceptance(memoryStorage(JSON.stringify({
      termsVersion: 'older',
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: '2026-07-26T12:00:00.000Z',
      method: 'google',
    })))).toBe(false)
  })
})
