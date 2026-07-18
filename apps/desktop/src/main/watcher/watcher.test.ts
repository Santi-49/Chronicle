/**
 * MVP-03 acceptance tests (TODO.md): C4 decision rules, recursive watching,
 * settle behavior (one candidate per save, including write bursts and
 * temp-write + atomic rename), initial-scan capture, hidden-directory
 * exclusion, unlink forwarding, and startup/shutdown.
 *
 * Integration tests use a real temp directory and a shortened settle window;
 * production keeps the C4 SETTLE_MS default (2 s).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluateWatchCandidate } from './evaluate'
import { MAX_FILE_BYTES, type WatchCandidate, type WatchDecision } from './rules'
import { createFolderWatcher, type FolderWatcher } from './watcher'

// ---------------------------------------------------------------------------
// C4 decision rules (pure)
// ---------------------------------------------------------------------------

function decide(p: string, sizeBytes = 1024): WatchDecision {
  return evaluateWatchCandidate({ path: p, sizeBytes })
}

describe('evaluateWatchCandidate', () => {
  it('accepts supported extensions case-insensitively', () => {
    for (const name of ['a.png', 'a.PNG', 'a.jpg', 'a.JPG', 'a.jpeg', 'a.JpEg']) {
      expect(decide(`C:\\Designs\\${name}`)).toEqual({ accepted: true })
    }
  })

  it('rejects unsupported types', () => {
    for (const name of ['a.txt', 'a.psd', 'a.gif', 'a.dwg', 'a']) {
      expect(decide(`C:\\Designs\\${name}`)).toEqual({
        accepted: false,
        reason: 'unsupported-type',
      })
    }
  })

  it('rejects temp/backup/lock file names as temporary', () => {
    for (const name of [
      '~$logo.png',
      'logo.png.tmp',
      'logo.png.TMP',
      'logo.png.temp',
      'logo.png.bak',
      'logo.png.part',
      'logo.png.crdownload',
      'logo.png~',
      '#logo.png#',
      'logo.png.swp',
    ]) {
      expect(decide(`C:\\Designs\\${name}`)).toEqual({ accepted: false, reason: 'temporary' })
    }
  })

  it('rejects dot-prefixed files and files inside hidden folders', () => {
    expect(decide('C:\\Designs\\.cache\\logo.png')).toEqual({ accepted: false, reason: 'hidden' })
    expect(decide('C:\\Designs\\.logo.png')).toEqual({ accepted: false, reason: 'hidden' })
    expect(decide('C:\\Designs\\.#logo.png')).toEqual({ accepted: false, reason: 'hidden' })
    expect(decide('/home/x/designs/.git/logo.png')).toEqual({ accepted: false, reason: 'hidden' })
  })

  it('applies the 50 MB cap as strictly-over (F3.6)', () => {
    expect(decide('C:\\Designs\\big.png', MAX_FILE_BYTES)).toEqual({ accepted: true })
    expect(decide('C:\\Designs\\big.png', MAX_FILE_BYTES + 1)).toEqual({
      accepted: false,
      reason: 'too-large',
    })
  })

  it('classifies in C4 order: hidden before temporary before type', () => {
    expect(decide('C:\\Designs\\.cache\\logo.png.tmp')).toEqual({
      accepted: false,
      reason: 'hidden',
    })
    expect(decide('C:\\Designs\\notes.txt.tmp')).toEqual({ accepted: false, reason: 'temporary' })
  })
})

// ---------------------------------------------------------------------------
// Folder watching (integration, real filesystem)
// ---------------------------------------------------------------------------

/** Short settle keeps tests fast; SETTLE_MS stays the production default. */
const TEST_SETTLE_MS = 250
/** Filesystem events on Windows can lag — poll generously. */
const WAIT_TIMEOUT_MS = 8_000

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('createFolderWatcher', () => {
  let dir: string
  let watcher: FolderWatcher | undefined
  let accepted: WatchCandidate[]
  let skipped: Array<{ candidate: WatchCandidate; reason: string }>
  let removed: string[]
  let ready: string[]

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-watch-'))
    accepted = []
    skipped = []
    removed = []
    ready = []
  })

  afterEach(async () => {
    await watcher?.close()
    watcher = undefined
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function startWatcher(): FolderWatcher {
    watcher = createFolderWatcher(
      {
        onAccepted: (c) => accepted.push(c),
        onSkipped: (c, reason) => skipped.push({ candidate: c, reason }),
        onRemoved: (p) => removed.push(p),
        onReady: (p) => ready.push(p),
      },
      { settleMs: TEST_SETTLE_MS },
    )
    watcher.watch(dir)
    return watcher
  }

  async function whenReady(): Promise<void> {
    await waitFor(() => ready.length > 0, 'initial scan')
  }

  it('captures existing files on the initial recursive scan', async () => {
    const sub = path.join(dir, 'brand', 'v1')
    fs.mkdirSync(sub, { recursive: true })
    fs.writeFileSync(path.join(sub, 'logo.png'), 'png-bytes')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'text')

    startWatcher()
    await waitFor(() => accepted.length === 1, 'existing png candidate')
    expect(accepted[0]!.path).toBe(path.join(sub, 'logo.png'))
    expect(accepted[0]!.sizeBytes).toBe(9)
    expect(skipped.some((s) => s.reason === 'unsupported-type')).toBe(true)
  })

  it('produces one settled candidate for a new save in a subfolder', async () => {
    startWatcher()
    await whenReady()

    const sub = path.join(dir, 'nested')
    fs.mkdirSync(sub)
    fs.writeFileSync(path.join(sub, 'banner.jpg'), 'jpeg-bytes')

    await waitFor(() => accepted.length === 1, 'new save candidate')
    expect(accepted[0]!.path).toBe(path.join(sub, 'banner.jpg'))
  })

  it('collapses a burst of writes into exactly one candidate (settle rule)', async () => {
    startWatcher()
    await whenReady()

    const file = path.join(dir, 'logo.png')
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, `burst-${i}-${'x'.repeat(i * 10)}`)
      await sleep(TEST_SETTLE_MS / 3) // keep writing inside the settle window
    }

    await waitFor(() => accepted.length >= 1, 'burst candidate')
    await sleep(TEST_SETTLE_MS * 3) // would surface any late duplicate
    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.path).toBe(file)
  })

  it('temp-write + rename yields one candidate for the final name only', async () => {
    startWatcher()
    await whenReady()

    const temp = path.join(dir, 'logo.png.tmp')
    const final = path.join(dir, 'logo.png')
    fs.writeFileSync(temp, 'new-version-bytes')
    await sleep(50)
    fs.renameSync(temp, final)

    await waitFor(() => accepted.length >= 1, 'renamed candidate')
    await sleep(TEST_SETTLE_MS * 3)
    expect(accepted.map((c) => c.path)).toEqual([final])
    // The vanished temp file must not be reported as a removed asset.
    expect(removed).toHaveLength(0)
  })

  it('never emits from hidden directories', async () => {
    startWatcher()
    await whenReady()

    const hidden = path.join(dir, '.cache')
    fs.mkdirSync(hidden)
    fs.writeFileSync(path.join(hidden, 'thumb.png'), 'bytes')
    fs.writeFileSync(path.join(dir, 'visible.png'), 'bytes')

    await waitFor(() => accepted.length === 1, 'visible candidate')
    await sleep(TEST_SETTLE_MS * 2)
    expect(accepted.map((c) => c.path)).toEqual([path.join(dir, 'visible.png')])
    expect(skipped.every((s) => !s.candidate.path.includes('.cache'))).toBe(true)
  })

  it('forwards deletion of a supported file to onRemoved', async () => {
    const file = path.join(dir, 'logo.png')
    fs.writeFileSync(file, 'bytes')
    startWatcher()
    await waitFor(() => accepted.length === 1, 'initial candidate')

    fs.rmSync(file)
    await waitFor(() => removed.length === 1, 'removal event')
    expect(removed).toEqual([file])
  })

  it('unwatch stops events for that folder; close stops everything', async () => {
    const w = startWatcher()
    await whenReady()
    expect(w.watched()).toEqual([path.resolve(dir)])

    await w.unwatch(dir)
    expect(w.watched()).toEqual([])
    fs.writeFileSync(path.join(dir, 'after-unwatch.png'), 'bytes')
    await sleep(TEST_SETTLE_MS * 3)
    expect(accepted).toHaveLength(0)

    // Re-watching rescans: the file saved while unwatched is now captured
    // (downstream hash dedup makes rescans safe). close() then stops everything.
    ready = []
    w.watch(dir)
    await whenReady()
    await waitFor(() => accepted.length === 1, 'rescan candidate')
    await w.close()
    fs.writeFileSync(path.join(dir, 'after-close.png'), 'bytes')
    await sleep(TEST_SETTLE_MS * 3)
    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.path).toBe(path.join(dir, 'after-unwatch.png'))
  })

  it('watching the same folder twice is a no-op', async () => {
    const w = startWatcher()
    await whenReady()
    w.watch(dir) // second call must not duplicate events
    fs.writeFileSync(path.join(dir, 'one.png'), 'bytes')
    await waitFor(() => accepted.length >= 1, 'candidate')
    await sleep(TEST_SETTLE_MS * 3)
    expect(accepted).toHaveLength(1)
    expect(w.watched()).toHaveLength(1)
  })
})
