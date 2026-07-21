# IBM Bob Usage Log

> **Why this file exists:** "Effective use of IBM Bob" is 25% of the score, and the README must document how Bob was used. Every PR adds one line here (see Definition of Done in [spec.md](spec.md)). This log becomes the source for the README's "How we used IBM Bob" section and the demo video.

Format: `date · member · what Bob did · feature/PR`.

| Date | Member | What IBM Bob did | Feature / PR |
|------|--------|------------------|--------------|
| 2026-07-19 | Joel | Bob analysed the full AI module structure, identified image-block format bug (`type:image` → `type:image_url` data-URL), fixed the `model_validate` guard for already-parsed `VersionAnnotation` instances, expanded test coverage from 3 → 19 tests (all passing), and corrected `pyproject.toml` dependency names | MVP-09 — Python AI service (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob wrote the full pipeline integration test suite: `conftest.py` generates real PNG/JPEG binaries (stdlib only, no Pillow), `test_pipeline.py` threads `image_loader → base64 → AnnotateRequest → model_engine` across all formats (.png, .jpg, .jpeg) and both annotation modes (first-version + diff); 40/40 tests green | MVP-09 — pipeline integration tests (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob prototyped an alternative queue worker and sidecar; during integration the team retained the generated C3 client and embedding-capable worker, while carrying forward Bob's Gemini/model-engine fixes and pipeline tests | MVP-09 — integration review (`feat/mvp-09-python-ai`) |
| 2026-07-21 | Santi R | Bob extended the C1 `TrackedFolder` contract with presentation fields (displayName/icon/color) and the `pickFolder`/`addFolder(path,meta)`/`updateFolder` methods, propagated them through the SQLite schema (idempotent column migration), repositories, IPC services, and tests, then wired the whole renderer off mock data onto live C1 hooks — status bar, onboarding, curated AI provider/model settings with a developer toggle, and real thumbnails; typecheck + 82 tests + build green | MVP-06 — app shell, onboarding, settings (`feat/mvp-06-shell-onboarding-settings`) |
| 2026-07-21 | Santi R | Bob added the New Project folder-selection flow: a new C1 `scanFolder` method and per-folder tracking selection (`excludedPaths`/`allowedExtensions`) on `TrackedFolder`, an idempotent v3 column migration, a watcher capture filter enforcing the selection on both initial scan and live saves, and a renderer subfolder/file tree with select-all + file-type toggles and a live match count; icon color now inherits the chosen accent; typecheck + 84 tests + build green | MVP-06 — folder selection (`feat/mvp-06-shell-onboarding-settings`) |
| 2026-07-21 | Santi R | Bob converted BYOK from a single key to **per-provider keys**: C1 `setApiKey`/`clearApiKey` now take a provider and a new `configuredProviders` replaces `hasApiKey`; the safeStorage secret store is provider-scoped with a one-time legacy-key migration; the AI worker resolves the key for each task's selected provider; Settings now shows a key row per provider (saved badges, switch without re-entry) and `.env.example` documents provider-native keys; also fixed the tracked-folders/account/AI settings alignment; typecheck + 84 tests + build green | MVP-06 — per-provider BYOK + settings polish (`feat/mvp-06-shell-onboarding-settings`) |


## Ideas for judge-visible Bob usage

- BobShell recipes checked into the repo (self-documenting workflows: scaffold, test, release).
- Bobalytics screenshots showing contribution tracking across the SDLC.
- Literate Coding sessions for watcher behavior, AI I/O contracts, and prompt experiments.
- Bob's built-in vulnerability/secrets scan before submission.
