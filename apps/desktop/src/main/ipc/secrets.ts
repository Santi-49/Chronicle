/**
 * BYOK API-key storage (C5 security boundary). Keys are encrypted with
 * Electron `safeStorage` (OS keychain / DPAPI) and persisted as opaque blobs
 * in the SQLite settings table under reserved, provider-scoped keys. They never
 * enter the C1 `AppSettings` object, are never sent to Chronicle's backend, and
 * no IPC method can read one back — the renderer only learns *which providers*
 * have a key (`configuredProviders`).
 *
 * Keys are stored per provider so a task's provider can be switched without
 * re-entering credentials (e.g. Gemini for annotation, OpenAI for embeddings).
 *
 * `SecretStore` is the injectable seam: services.ts depends only on the type
 * (Electron-free, so tests use an in-memory store); this module holds the real
 * safeStorage implementation.
 */
import { safeStorage } from 'electron'
import type { ChronicleDb } from '../db/database'
import { getSetting, setSetting } from '../db/repositories'

export interface SecretStore {
  /** Encrypts and persists the key for one provider. Rejects if secure storage is unavailable. */
  set(provider: string, plaintext: string): Promise<void> | void
  has(provider: string): Promise<boolean> | boolean
  clear(provider: string): Promise<void> | void
  /** Provider ids that currently have a saved key. */
  providers(): Promise<string[]> | string[]
}

/** Reserved settings-table key prefix. getSettings() never reads these. */
const SECRET_PREFIX = 'secret:ai-api-key:'
/** Pre-per-provider single key (migrated to the default provider on first open). */
const LEGACY_SECRET_KEY = 'secret:ai-api-key'
/** The demo default provider a legacy single key is attributed to (spec/RESEARCH). */
const LEGACY_DEFAULT_PROVIDER = 'google_genai'
const OLD_GOOGLE_PROVIDER = 'google'

function secretKey(provider: string): string {
  return `${SECRET_PREFIX}${provider}`
}

/**
 * One-time migration: a single key saved before per-provider storage becomes
 * the default provider's key, so existing installs keep working without asking
 * the user to re-enter it. Copies the raw (already-encrypted) row — no decrypt.
 */
function migrateLegacyKey(db: ChronicleDb): void {
  const legacy = getSetting<string>(db, LEGACY_SECRET_KEY)
  if (legacy !== undefined) {
    if (getSetting<string>(db, secretKey(LEGACY_DEFAULT_PROVIDER)) === undefined) {
      setSetting(db, secretKey(LEGACY_DEFAULT_PROVIDER), legacy)
    }
    db.prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_SECRET_KEY)
  }

  const oldGoogle = getSetting<string>(db, secretKey(OLD_GOOGLE_PROVIDER))
  if (oldGoogle !== undefined) {
    if (getSetting<string>(db, secretKey(LEGACY_DEFAULT_PROVIDER)) === undefined) {
      setSetting(db, secretKey(LEGACY_DEFAULT_PROVIDER), oldGoogle)
    }
    db.prepare('DELETE FROM settings WHERE key = ?').run(secretKey(OLD_GOOGLE_PROVIDER))
  }
}

export function createSafeStorageSecretStore(db: ChronicleDb): SecretStore {
  migrateLegacyKey(db)
  return {
    set(provider: string, plaintext: string): void {
      if (!safeStorage.isEncryptionAvailable()) {
        // Never fall back to plaintext — better no key than an unencrypted one.
        throw new Error('Secure storage is unavailable on this system; the API key was not saved')
      }
      setSetting(db, secretKey(provider), safeStorage.encryptString(plaintext).toString('base64'))
    },
    has(provider: string): boolean {
      return getSetting<string>(db, secretKey(provider)) !== undefined
    },
    clear(provider: string): void {
      db.prepare('DELETE FROM settings WHERE key = ?').run(secretKey(provider))
    },
    providers(): string[] {
      const rows = db
        .prepare('SELECT key FROM settings WHERE key LIKE ?')
        .all(`${SECRET_PREFIX}%`) as Array<{ key: string }>
      return rows.map((row) => row.key.slice(SECRET_PREFIX.length))
    },
  }
}

/**
 * Main-process-only read for the AI pipeline (MVP-09). Deliberately not part
 * of `SecretStore` so nothing reachable from an IPC handler can return it.
 */
export function readApiKey(db: ChronicleDb, provider: string): string | null {
  const blob = getSetting<string>(db, secretKey(provider))
  if (blob === undefined || blob === null) return null
  return safeStorage.decryptString(Buffer.from(blob, 'base64'))
}
