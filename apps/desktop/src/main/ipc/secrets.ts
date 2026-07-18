/**
 * BYOK API-key storage (C5 security boundary). The key is encrypted with
 * Electron `safeStorage` (OS keychain / DPAPI) and persisted as an opaque
 * blob in the SQLite settings table under a reserved key. It never enters
 * the C1 `AppSettings` object, is never sent to Chronicle's backend, and no
 * IPC method can read it back — the renderer only gets `hasApiKey()`.
 *
 * `SecretStore` is the injectable seam: services.ts depends only on the
 * type (Electron-free, so tests use an in-memory store); this module holds
 * the real safeStorage implementation.
 */
import { safeStorage } from 'electron'
import type { ChronicleDb } from '../db/database'
import { getSetting, setSetting } from '../db/repositories'

export interface SecretStore {
  /** Encrypts and persists the key. Rejects if secure storage is unavailable. */
  set(plaintext: string): Promise<void> | void
  has(): Promise<boolean> | boolean
  clear(): Promise<void> | void
}

/**
 * Reserved settings-table key. getSettings() never reads it (it builds the
 * C1 AppSettings shape explicitly), so the blob cannot leak to the renderer.
 */
const SECRET_KEY = 'secret:ai-api-key'

export function createSafeStorageSecretStore(db: ChronicleDb): SecretStore {
  return {
    set(plaintext: string): void {
      if (!safeStorage.isEncryptionAvailable()) {
        // Never fall back to plaintext — better no key than an unencrypted one.
        throw new Error('Secure storage is unavailable on this system; the API key was not saved')
      }
      setSetting(db, SECRET_KEY, safeStorage.encryptString(plaintext).toString('base64'))
    },
    has(): boolean {
      return getSetting<string>(db, SECRET_KEY) !== undefined
    },
    clear(): void {
      db.prepare('DELETE FROM settings WHERE key = ?').run(SECRET_KEY)
    },
  }
}

/**
 * Main-process-only read for the AI pipeline (MVP-09). Deliberately not part
 * of `SecretStore` so nothing reachable from an IPC handler can return it.
 */
export function readApiKey(db: ChronicleDb): string | null {
  const blob = getSetting<string>(db, SECRET_KEY)
  if (blob === undefined || blob === null) return null
  return safeStorage.decryptString(Buffer.from(blob, 'base64'))
}
