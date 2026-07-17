/**
 * Folder watching (MVP-03, spec F2/F3). Wraps chokidar with the C4 rules:
 * recursive watching per tracked folder, ~2 s settle before a save counts,
 * and accepted/skipped callbacks for the capture pipeline (MVP-04).
 *
 * One chokidar instance per tracked folder — adding/removing a folder never
 * disturbs the others, and shutdown is a per-folder close().
 */
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import path from 'node:path'
import type { Stats } from 'node:fs'
import { SETTLE_MS, type WatchCandidate, type WatchDecision } from './rules'
import { evaluateWatchCandidate, hasWatchedExtension, isTemporaryPath } from './evaluate'

type SkipReason = Extract<WatchDecision, { accepted: false }>['reason']

export interface FolderWatcherCallbacks {
  /** A settled, accepted save — hand this to version capture. */
  onAccepted: (candidate: WatchCandidate) => void
  /** A settled file the rules rejected. Only 'too-large' needs a visible notice (F3.6). */
  onSkipped?: (candidate: WatchCandidate, reason: SkipReason) => void
  /** A previously supported file disappeared — capture marks it "no longer on disk" (F3.7). */
  onRemoved?: (filePath: string) => void
  /** The initial recursive scan of a tracked folder finished. */
  onReady?: (folderPath: string) => void
  onError?: (error: Error) => void
}

export interface FolderWatcherOptions {
  /**
   * Settle window in ms — defaults to the C4 SETTLE_MS guarantee (2 s).
   * Overridable so tests don't wait 2 s per event; production code must
   * not shorten it.
   */
  settleMs?: number
  /** Emit candidates for files that already exist when a folder starts being watched. */
  emitInitial?: boolean
}

export interface FolderWatcher {
  /** Start watching a folder recursively. Watching the same folder twice is a no-op. */
  watch(folderPath: string): void
  /** Stop watching one folder. Unknown paths are a no-op. */
  unwatch(folderPath: string): Promise<void>
  /** Absolute paths currently being watched. */
  watched(): string[]
  /** Stop everything (app shutdown). */
  close(): Promise<void>
}

export function createFolderWatcher(
  callbacks: FolderWatcherCallbacks,
  options: FolderWatcherOptions = {},
): FolderWatcher {
  const settleMs = options.settleMs ?? SETTLE_MS
  const emitInitial = options.emitInitial ?? true
  const watchers = new Map<string, FSWatcher>()

  const normalize = (folderPath: string): string => path.resolve(folderPath)

  const handleFile = (filePath: string, stats: Stats | undefined): void => {
    const candidate: WatchCandidate = { path: filePath, sizeBytes: stats?.size ?? 0 }
    const decision = evaluateWatchCandidate(candidate)
    if (decision.accepted) callbacks.onAccepted(candidate)
    else callbacks.onSkipped?.(candidate, decision.reason)
  }

  return {
    watch(folderPath: string): void {
      const root = normalize(folderPath)
      if (watchers.has(root)) return

      const watcher = chokidarWatch(root, {
        ignoreInitial: !emitInitial,
        // Stats accompany every add/change so the size cap needs no extra stat call.
        alwaysStat: true,
        // Editors that save via temp-write + rename produce one 'change'/'add'
        // for the real name instead of an unlink/re-add pair.
        atomic: true,
        // F3.1 settle rule: an event fires only after the file's size has been
        // stable for settleMs — write bursts collapse into one candidate.
        awaitWriteFinish: { stabilityThreshold: settleMs, pollInterval: 100 },
        // Never descend into hidden directories (relative to the tracked root,
        // so a user profile path with dotted parents still works).
        ignored: (candidatePath: string): boolean => {
          const relative = path.relative(root, candidatePath)
          if (relative === '' || relative.startsWith('..')) return false
          return relative
            .split(/[\\/]/)
            .some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..')
        },
      })

      watcher.on('add', handleFile)
      watcher.on('change', handleFile)
      watcher.on('unlink', (filePath: string) => {
        // Only files that could have been captured matter downstream.
        if (hasWatchedExtension(filePath) && !isTemporaryPath(filePath)) {
          callbacks.onRemoved?.(filePath)
        }
      })
      watcher.on('ready', () => callbacks.onReady?.(root))
      watcher.on('error', (error) => callbacks.onError?.(error as Error))

      watchers.set(root, watcher)
    },

    async unwatch(folderPath: string): Promise<void> {
      const root = normalize(folderPath)
      const watcher = watchers.get(root)
      if (!watcher) return
      watchers.delete(root)
      await watcher.close()
    },

    watched(): string[] {
      return [...watchers.keys()]
    },

    async close(): Promise<void> {
      const open = [...watchers.values()]
      watchers.clear()
      await Promise.all(open.map((w) => w.close()))
    },
  }
}
