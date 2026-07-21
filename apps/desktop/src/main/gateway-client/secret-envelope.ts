import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)

interface EnvelopeV1 {
  version: 1
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

export async function encryptProviderKeys(keys: Record<string, string>, passphrase: string): Promise<string> {
  if (passphrase.length < 12) throw new Error('Sync passphrase must be at least 12 characters')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(passphrase, salt, 32) as Buffer
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(keys), 'utf8'), cipher.final()])
  const envelope: EnvelopeV1 = {
    version: 1,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
  return JSON.stringify(envelope)
}

export async function decryptProviderKeys(envelopeText: string, passphrase: string): Promise<Record<string, string>> {
  let envelope: EnvelopeV1
  try { envelope = JSON.parse(envelopeText) as EnvelopeV1 } catch { throw new Error('Invalid synced-key envelope') }
  if (envelope.version !== 1 || envelope.kdf !== 'scrypt') throw new Error('Unsupported synced-key envelope')
  try {
    const salt = Buffer.from(envelope.salt, 'base64')
    const iv = Buffer.from(envelope.iv, 'base64')
    const key = await deriveKey(passphrase, salt, 32) as Buffer
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')
    const parsed = JSON.parse(plaintext) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    for (const [provider, value] of Object.entries(parsed)) {
      if (!provider || typeof value !== 'string' || !value) throw new Error()
    }
    return parsed as Record<string, string>
  } catch {
    throw new Error('Could not decrypt synced keys; check the passphrase')
  }
}
