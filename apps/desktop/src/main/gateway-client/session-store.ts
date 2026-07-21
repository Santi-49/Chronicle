import { safeStorage } from 'electron'
import type { components } from '../../../../../packages/contracts/api/generated'
import type { ChronicleDb } from '../db/database'
import { getSetting, setSetting } from '../db/repositories'
import type { TokenStore } from './client'

type TokenPair = components['schemas']['TokenPair']
const SESSION_KEY = 'secret:control-plane-session'

export function createSessionStore(db: ChronicleDb): TokenStore {
  return {
    read(): TokenPair | null {
      const blob = getSetting<string>(db, SESSION_KEY)
      if (!blob || !safeStorage.isEncryptionAvailable()) return null
      try {
        return JSON.parse(safeStorage.decryptString(Buffer.from(blob, 'base64'))) as TokenPair
      } catch {
        db.prepare('DELETE FROM settings WHERE key = ?').run(SESSION_KEY)
        return null
      }
    },
    write(tokens): void {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure session storage is unavailable')
      const encrypted = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64')
      setSetting(db, SESSION_KEY, encrypted)
    },
    clear(): void {
      db.prepare('DELETE FROM settings WHERE key = ?').run(SESSION_KEY)
    },
  }
}
