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

## Ideas for judge-visible Bob usage

- BobShell recipes checked into the repo (self-documenting workflows: scaffold, test, release).
- Bobalytics screenshots showing contribution tracking across the SDLC.
- Literate Coding sessions for watcher behavior, AI I/O contracts, and prompt experiments.
- Bob's built-in vulnerability/secrets scan before submission.
