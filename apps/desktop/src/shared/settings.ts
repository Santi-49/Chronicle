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
  system: {
    /**
     * Closing the window leaves Chronicle capturing from the tray instead of
     * quitting. Device-local by nature (a tray is a property of this machine's
     * shell), so it is deliberately excluded from portable settings sync.
     *
     * Whether Chronicle starts at login is NOT stored here: the operating
     * system's login-item registry is its single source of truth, because the
     * user can revoke it from Task Manager or System Settings without
     * Chronicle running. It is read through the C1 system-integration methods.
     */
    runInBackground: boolean
    /**
     * Whether that login launch opens the window or stays in the tray.
     *
     * This *is* stored, unlike the enabled flag above, because Windows does
     * not return a login item's registered arguments (measured — see
     * `main/system/login-item.ts`), so the chosen mode cannot be recovered
     * from the shell. It is only a display memory: the registered command line
     * decides the actual launch, so drift costs at most a stale checkbox.
     */
    openAtLoginOpensWindow: boolean
  }
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
