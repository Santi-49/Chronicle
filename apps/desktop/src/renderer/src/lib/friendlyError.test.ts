import { describe, expect, it } from 'vitest'
import { friendlyError } from './friendlyError'

describe('friendlyError', () => {
  it('removes Electron IPC implementation details from Google timeout errors', () => {
    const error = new Error(
      "Error invoking remote method 'chronicle:loginWithGoogle': Error: Google sign-in timed out",
    )

    expect(friendlyError(error)).toBe(
      'Google sign-in timed out. Nothing changed—try again when you are ready.',
    )
  })

  it('keeps infrastructure details out of connection failure copy', () => {
    expect(friendlyError(new TypeError('fetch failed'))).toBe(
      'That account action could not be completed. Continue locally and try again later.',
    )
  })
})
