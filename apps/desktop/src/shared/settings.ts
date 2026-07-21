/**
 * C5 — Settings contract.
 *
 * The single typed shape for every user-configurable setting, used by the
 * renderer (Settings screen), the main process (all subsystems), and the AI
 * engine factory. Persisted as JSON in the SQLite `settings` table (C2).
 *
 * SECRETS NEVER ENTER THIS OBJECT and never reach the renderer:
 *   - the AI API key            → Electron safeStorage, main process only
 *   - control-plane auth tokens → Electron safeStorage, main process only
 * The renderer manages them through dedicated per-provider IPC calls (C1:
 * setApiKey / configuredProviders / clearApiKey); plaintext is write-only and
 * key material remains on the main side.
 *
 * Fixed behavioral constants (watched extensions, settle time, size cap) are
 * NOT settings — they live in the watcher rules contract (C4).
 */

/** Provider identifiers remain open so adding a provider is not a contract change. */
export type AiProvider = string
export type AppearanceTheme = 'system' | 'dark' | 'light'

export interface AppSettings {
  appearance: { theme: AppearanceTheme }
  ai: {
    /** 'local' = BYOK through the loopback Python service · 'gateway' = Chronicle service (stretch F9). */
    mode: 'local' | 'gateway'
    chat: { provider: AiProvider; model: string }
    embeddings: { provider: AiProvider; model: string }
  }
  controlPlane: {
    baseUrl: string
    /** Default-enabled usage reporting; POST-04 implements event delivery. */
    telemetryOptIn: boolean
    /** Signed-in, portable preference sync. Device paths and project metadata never sync. */
    settingsSyncEnabled: boolean
    /** Signed-in, separately enabled E2E-encrypted provider-key sync. */
    apiKeySyncEnabled: boolean
  }
}
