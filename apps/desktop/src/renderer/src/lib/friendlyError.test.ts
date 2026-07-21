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

  it('turns connection failures into an actionable control-plane message', () => {
    expect(friendlyError(new TypeError('fetch failed'))).toMatch(/Start the control plane/)
  })
})
