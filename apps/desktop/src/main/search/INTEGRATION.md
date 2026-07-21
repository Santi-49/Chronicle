/**
 * MVP-10 patch — wires the search engine into `ChronicleServices`.
 *
 * When MVP-09 is merged into `dev`, apply this diff to
 * `apps/desktop/src/main/ipc/services.ts`:
 *
 * 1. Add this import near the other main/ imports:
 *
 *      import { search } from '../search'
 *
 * 2. Replace the placeholder:
 *
 *      // F7 — search (MVP-10)
 *      search: notImplemented('Search (MVP-10)'),
 *
 *    with:
 *
 *      // F7 — search (MVP-10)
 *      async search(query) {
 *        const q = expectString(query, 'query')
 *        const settings = await api.getSettings()
 *        const model = settings.ai.embeddings.model
 *        return search(q, {
 *          db,
 *          // Only embed if we have a key and a model configured.
 *          // The engine degrades to keyword-only when embedQuery is null.
 *          embedQuery: (await secrets.has()) && model !== ''
 *            ? (text) => aiClient.embedText(text, settings, readApiKey())
 *            : null,
 *          embeddingsModel: model,
 *        })
 *      },
 *
 * The `aiClient` reference is the same client used by the AI worker.
 * Inject it into `ChronicleServicesDeps` the same way the worker does it.
 *
 * ── Standalone integration (for testing this PR before MVP-09 merges) ───
 *
 * Run the search engine tests directly — they don't need services.ts:
 *
 *   npm --prefix apps/desktop test -- src/main/search/engine.test.ts --run
 */
