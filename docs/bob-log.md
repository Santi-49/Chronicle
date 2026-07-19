# IBM Bob Usage Log

> **Why this file exists:** "Effective use of IBM Bob" is 25% of the score, and the README must document how Bob was used. Every PR adds one line here (see Definition of Done in [spec.md](spec.md)). This log becomes the source for the README's "How we used IBM Bob" section and the demo video.

Format: `date · member · what Bob did · feature/PR`.

| Date | Member | What IBM Bob did | Feature / PR |
|------|--------|------------------|--------------|
| 2026-07-17 | Santi R | *Pending — this task was implemented with another AI assistant (Claude Code); log the real Bob usage for this PR (e.g. review/regenerate with Bob) before submission* | MVP-02 — SQLite init + repositories (`feat/mvp-02-sqlite-repositories`) |
| 2026-07-18 | Santi R | *Pending — implemented with Claude Code; log real Bob usage for this PR (e.g. Bob review of the settle/ignore rules) before submission* | MVP-03 — folder watching (`feat/mvp-03-folder-watcher`) |
| 2026-07-18 | Santi R | *Pending — implemented with Claude Code; log real Bob usage for this PR (e.g. Bob review of the hash/dedup pipeline) before submission* | MVP-04 — version capture (`feat/mvp-04-version-capture`) |
| 2026-07-19 | Santi R | *Pending — implemented with Claude Code; log real Bob usage for this PR (e.g. Bob security review of the IPC surface / preload boundary) before submission* | MVP-05 — secure IPC bridge (`feat/mvp-05-ipc-bridge`) |
| 2026-07-19 | TBD | *Pending — implemented with Codex; run IBM Bob review of the loopback service, secret boundary, retry worker, and generated C3 types before submission* | MVP-09 — local AI service + Electron worker (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob analysed the full AI module structure, identified image-block format bug (`type:image` → `type:image_url` data-URL), fixed the `model_validate` guard for already-parsed `VersionAnnotation` instances, expanded test coverage from 3 → 19 tests (all passing), and corrected `pyproject.toml` dependency names | MVP-09 — Python AI service (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob wrote the full pipeline integration test suite: `conftest.py` generates real PNG/JPEG binaries (stdlib only, no Pillow), `test_pipeline.py` threads `image_loader → base64 → AnnotateRequest → model_engine` across all formats (.png, .jpg, .jpeg) and both annotation modes (first-version + diff); 40/40 tests green | MVP-09 — pipeline integration tests (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Joel | Bob prototyped an alternative queue worker and sidecar; during integration the team retained the generated C3 client and embedding-capable worker, while carrying forward Bob's Gemini/model-engine fixes and pipeline tests | MVP-09 — integration review (`feat/mvp-09-python-ai`) |
| 2026-07-19 | Santi R | *Pending — implemented with Claude Code; run IBM Bob review before submission.* Relocated the Python service to `services/ai/` (package `chronicle_ai`), reorganised the subproject (routes/engine/schemas/prompts), fixed the worker to fail fast on non-retryable 4xx errors, and added `setup-ai`/`run-ai`/`test-ai`/`generate-ai-types` Make targets; 41 Python + 4 worker tests green | MVP-09 — service relocation + fixes (`feat/mvp-09-python-ai`) |

## Ideas for judge-visible Bob usage

- BobShell recipes checked into the repo (self-documenting workflows: scaffold, test, release).
- Bobalytics screenshots showing contribution tracking across the SDLC.
- Literate Coding sessions for watcher behavior, AI I/O contracts, and prompt experiments.
- Bob's built-in vulnerability/secrets scan before submission.
