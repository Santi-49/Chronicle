# gateway-client

Client for the optional FastAPI control plane. POST-03 implements Chronicle JWT
sessions (password and Google), automatic refresh, best-effort installation
registration, revisioned portable-settings sync, and opaque encrypted-secret CRUD.

Google sign-in first calls the public Chronicle `GET /health` endpoint with a short
timeout, then uses the operating system's default external browser, a random loopback
callback, state, nonce, and PKCE S256. An unhealthy control plane starts no browser flow.
The app persists Chronicle tokens with Electron `safeStorage`; it
does not persist Google tokens. API keys remain in the main process and are only
uploaded after explicit opt-in as an AES-256-GCM envelope derived from a user
passphrase. The signed-in UI has a separate enable checkbox plus explicit save/restore
actions. The server receives neither plaintext keys nor the passphrase.

Types are imported from `packages/contracts/api/generated` — never hand-written.
Usage event delivery and stats remain POST-04.
