export const LANDING_BASE_URL = __CHRONICLE_LANDING_URL__.replace(/\/+$/, '')
export const TERMS_URL = `${LANDING_BASE_URL}/terms-and-services/`
export const PRIVACY_URL = `${LANDING_BASE_URL}/privacy/`

export const TERMS_VERSION = '2026-07-22'
export const PRIVACY_VERSION = '2026-07-25'
export const LEGAL_ACCEPTANCE_STORAGE_KEY = 'chronicle-legal-acceptance'

export type LegalAcceptanceMethod = 'local' | 'google'

export interface LegalAcceptance {
  termsVersion: string
  privacyVersion: string
  acceptedAt: string
  method: LegalAcceptanceMethod
}

type LegalAcceptanceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function hasCurrentLegalAcceptance(storage: Pick<Storage, 'getItem'>): boolean {
  const serialized = storage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY)
  if (!serialized) return false

  try {
    const acceptance = JSON.parse(serialized) as Partial<LegalAcceptance>
    return (
      acceptance.termsVersion === TERMS_VERSION &&
      acceptance.privacyVersion === PRIVACY_VERSION &&
      typeof acceptance.acceptedAt === 'string' &&
      (acceptance.method === 'local' || acceptance.method === 'google')
    )
  } catch {
    return false
  }
}

export function recordLegalAcceptance(
  storage: LegalAcceptanceStorage,
  method: LegalAcceptanceMethod,
  acceptedAt = new Date(),
): LegalAcceptance {
  const acceptance: LegalAcceptance = {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: acceptedAt.toISOString(),
    method,
  }
  storage.setItem(LEGAL_ACCEPTANCE_STORAGE_KEY, JSON.stringify(acceptance))
  return acceptance
}
