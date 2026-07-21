import { describe, expect, it } from 'vitest'
import { decryptProviderKeys, encryptProviderKeys } from './secret-envelope'

describe('E2E provider-key envelope', () => {
  it('round-trips multiple provider keys without exposing plaintext', async () => {
    const keys = { google: 'google-secret-value', openai: 'openai-secret-value' }
    const envelope = await encryptProviderKeys(keys, 'correct horse battery staple')
    expect(envelope).not.toContain('google-secret-value')
    expect(envelope).not.toContain('openai-secret-value')
    await expect(decryptProviderKeys(envelope, 'correct horse battery staple')).resolves.toEqual(keys)
  })

  it('rejects short and incorrect passphrases', async () => {
    await expect(encryptProviderKeys({ google: 'secret' }, 'too-short')).rejects.toThrow(/12 characters/)
    const envelope = await encryptProviderKeys({ google: 'secret' }, 'a sufficiently long phrase')
    await expect(decryptProviderKeys(envelope, 'the wrong long passphrase')).rejects.toThrow(/passphrase/)
  })
})
