# Versioning module (MVP-04)

Turns an accepted watcher candidate into a **deduplicated, append-only asset
version** (spec F3). Consumers: watcher wiring (`onAccepted` → `captureVersion`,
`onRemoved` → `markFileMissing`) and restore (MVP-07, this folder later).

## Files

| File | Role |
|---|---|
| `capture.ts` | `captureVersion(db, libraryRoot, filePath)` — the F3 pipeline; `markFileMissing` for F3.7. |
| `library.ts` | Content-addressed store: single-pass stream copy + SHA-256, `library/<hash first 2>/<hash>` layout. |
| `dimensions.ts` | PNG/JPEG/PSD width/height from format headers (positioned reads, no image dependency). |
| `capture.test.ts` | MVP-04 acceptance tests against a real SQLite file + real library dir. |

Everything is Electron-free: production passes `libraryDir()` from
`src/main/paths.ts`; tests pass temp directories.

## Capture rules as built

1. **Snapshot first, hash in the same pass.** The source file is streamed once
   into a temp file inside the library while SHA-256 and byte size accumulate
   on the same chunks, then renamed to `library/<hash first 2>/<hash>`. The
   stored hash therefore always describes exactly the stored bytes, even if
   the editor keeps writing to the source (F3.8 — nothing is buffered in
   memory, nothing runs on the UI path).
2. **Dedup by content (F3.3/F3.5).** If the asset's latest version has the
   same hash, the snapshot is discarded — `unchanged`, no version, no AI job.
   If the *library* already has the content (e.g. another asset with identical
   bytes), nothing new is written; both versions reference one stored file.
3. **Asset identity = resolved path (F3.7).** New path → new asset with
   version 1; known path → version N+1 (`appendVersion` is transactional and
   append-only). A capture of a vanished file — and `markFileMissing` — flags
   the asset `on_disk = 0`; history is never deleted.
4. **Metadata (F3.5).** Size and hash come from the snapshot pass; width and
   height are parsed from the immutable library copy (PNG IHDR / JPEG SOFn).
   Unparseable content captures fine with `null` dimensions.
5. **AI is enqueued, never awaited (F4).** The version insert and its
   `ai_annotation` queue item (`{ versionId }`) commit in one transaction —
   a version can't exist without its queued job. Nothing waits on a network.
6. **Size cap re-checked (F3.6).** The watcher already rejects > 50 MB; capture
   re-checks so no other caller can bypass the cap.
7. **Same-path captures are serialized** in-process, so a stale watcher event
   can never race a fresh one into a duplicate version; different paths hash
   concurrently. Expected filesystem outcomes never throw — they return
   `{ outcome: 'skipped', reason: 'file-missing' | 'too-large' }`.

## Library layout

Unchanged from `apps/desktop/README.md` ("Where app data lives"):
`library/<hash first 2 chars>/<sha256 hex>`, originals, no compression, no
deltas. Temp snapshots are `.snapshot-<uuid>` inside the library root and are
removed on both success and failure.
