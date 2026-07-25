# Watcher module (MVP-03)

Turns raw filesystem activity in tracked folders into **one settled capture
candidate per real PNG/JPG save** (spec F2/F3). Consumers: startup wiring and
the version-capture pipeline (MVP-04).

## Files

| File | Role |
|---|---|
| `rules.ts` | **C4 contract** — extensions, settle guarantee, size cap, decision shapes. Do not edit without an approved contract PR. |
| `evaluate.ts` | Pure implementation of the C4 decision (hidden → temporary → unsupported-type → too-large). |
| `watcher.ts` | chokidar lifecycle: `createFolderWatcher(callbacks, options)` → `watch` / `unwatch` / `watched` / `close`. |
| `watcher.test.ts` | Rule tests + real-filesystem integration tests (shortened settle window). |

## Behavior as built

- **One chokidar instance per tracked folder**, recursive. Adding/removing a
  folder never disturbs the others; `close()` is app shutdown.
- **Settle rule (F3.1):** implemented with chokidar's
  `awaitWriteFinish { stabilityThreshold: SETTLE_MS (2 s), pollInterval: 100 }` —
  an `add`/`change` only fires after the file size has been stable, so write
  bursts collapse into one candidate. Tests shorten the window via the
  `settleMs` option; production must not.
- **Atomic temp-write + rename saves** (`logo.png.tmp` → `logo.png`) produce one
  candidate for the final name (`atomic: true` plus the temp-name rejection).
  The vanished temp file is *not* reported as a removed asset.
- **Initial scan:** existing images are emitted as candidates when a folder is
  (re-)watched (`emitInitial`, default on). Safe because capture dedups by
  content hash — a rescan of unchanged files creates no new versions.
- **Ignore rules:**
  - *Hidden:* any dot-prefixed path segment **relative to the tracked root**
    is never descended into (chokidar `ignored`), and `evaluate.ts` rejects
    dot-prefixed segments as `hidden`. Limitation: a tracked root whose own
    path contains a dot-prefixed segment is unsupported (rejected as hidden);
    Windows hidden *attributes* (without a leading dot) are not detected — the
    dotfile convention is the cross-platform rule.
  - *Temporary:* Office `~$` prefixes, trailing `~` backups, emacs `#auto#`,
    and `.tmp/.temp/.bak/.old/.part/.partial/.crdownload/.download/.swp/.swo/.swx`
    suffixes.
  - *Type:* `.png/.jpg/.jpeg/.psd`, case-insensitive (C4 `WATCHED_EXTENSIONS`).
  - *Size:* strictly over 50 MB → skipped with reason `too-large` — the only
    rejection that warrants a visible UI notice (F3.6).
- **Callbacks:** `onAccepted(candidate)`, `onSkipped(candidate, reason)`,
  `onRemoved(path)` (supported files only — feeds F3.7 "no longer on disk"),
  `onReady(folder)` (initial scan done), `onError(error)`.

## Runtime note

chokidar 5 is ESM-only while the main bundle is CJS with externalized deps.
Verified working: Electron 43 runs Node 24, where `require()` of an ESM module
is supported natively. No bundler workaround needed.

## Verification status

- Automated: 14 tests (rules + integration on a real temp dir) pass on Windows.
- **Manual demo-editor test: pending** — MVP-03's "done when" requires saving
  from the actual demo editor (temp-write/atomic-rename behavior) and observing
  exactly one candidate per save. Do this when the capture pipeline (MVP-04)
  makes candidates visible, and log findings in `docs/challenge/RESEARCH.md`.
