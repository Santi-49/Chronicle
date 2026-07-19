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
 * The renderer manages them through dedicated IPC calls (C1: setApiKey /
 * hasApiKey / clearApiKey) that write and read only on the main side.
 *
 * Fixed behavioral constants (watched extensions, settle time, size cap) are
 * NOT settings — they live in the watcher rules contract (C4).
 */

/** Provider identifiers remain open so adding a provider is not a contract change. */
export type AiProvider = string

export interface AppSettings {
  ai: {
    /** 'local' = BYOK through the loopback Python service · 'gateway' = Chronicle service (stretch F9). */
    mode: 'local' | 'gateway'
    chat: { provider: AiProvider; model: string }
    embeddings: { provider: AiProvider; model: string }
  }
  controlPlane: {
    baseUrl: string
    /** Telemetry runs only when signed in AND opted in (spec F1/F8). */
    telemetryOptIn: boolean
  }
}
