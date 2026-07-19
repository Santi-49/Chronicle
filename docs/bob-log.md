# IBM Bob Usage Log

> **Why this file exists:** "Effective use of IBM Bob" is 25% of the score, and the README must document how Bob was used. Every PR adds one line here (see Definition of Done in [spec.md](spec.md)). This log becomes the source for the README's "How we used IBM Bob" section and the demo video.

Format: `date · member · what Bob did · feature/PR`.

| Date | Member | What IBM Bob did | Feature / PR |
|------|--------|------------------|--------------|
| 2026-07-19 | Joel | Bob analysed the full AI module structure, identified image-block format bug (`type:image` → `type:image_url` data-URL), fixed the `model_validate` guard for already-parsed `VersionAnnotation` instances, expanded test coverage from 3 → 19 tests (all passing), and corrected `pyproject.toml` dependency names | MVP-09 — Python AI service (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob wrote the full pipeline integration test suite: `conftest.py` generates real PNG/JPEG binaries (stdlib only, no Pillow), `test_pipeline.py` threads `image_loader → base64 → AnnotateRequest → model_engine` across all formats (.png, .jpg, .jpeg) and both annotation modes (first-version + diff); 40/40 tests green | MVP-09 — pipeline integration tests (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob prototyped an alternative queue worker and sidecar; during integration the team retained the generated C3 client and embedding-capable worker, while carrying forward Bob's Gemini/model-engine fixes and pipeline tests | MVP-09 — integration review (`feat/mvp-09-python-ai`) |


## Ideas for judge-visible Bob usage

- BobShell recipes checked into the repo (self-documenting workflows: scaffold, test, release).
- Bobalytics screenshots showing contribution tracking across the SDLC.
- Literate Coding sessions for watcher behavior, AI I/O contracts, and prompt experiments.
- Bob's built-in vulnerability/secrets scan before submission.
