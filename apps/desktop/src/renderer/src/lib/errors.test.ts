import { describe, expect, it } from 'vitest'
import { friendlyIpcError } from './errors'

describe('friendlyIpcError', () => {
  it('removes Electron channel and JavaScript error prefixes', () => {
    expect(
      friendlyIpcError(
        new Error(
          "Error invoking remote method 'chronicle:updateSettings': TypeError: The provider rejected the API key or model configuration.",
        ),
      ),
    ).toBe('The provider rejected the API key or model configuration.')
  })

  it('preserves an already friendly error and provides a fallback', () => {
    expect(friendlyIpcError(new Error('The local AI service could not be reached.'))).toBe(
      'The local AI service could not be reached.',
    )
    expect(friendlyIpcError(null)).toBe('The operation could not be completed.')
  })
})
