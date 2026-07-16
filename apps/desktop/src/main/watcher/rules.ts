/**
 * C4 — Watcher operation contract (spec F2/F3).
 *
 * Defines accepted inputs, outputs, and externally visible watcher behavior.
 * Filesystem event handling, glob/regex choices, debounce algorithms, and
 * editor-specific heuristics belong to the implementation and its tests.
 */

/** F2 — only these count, matched case-insensitively against the extension. */
export const WATCHED_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const

/** F3.1 — a save is finished when the file stops changing for this long. */
export const SETTLE_MS = 2_000

/** F3.6 — larger files are skipped with a visible notice. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

export interface WatchCandidate {
  path: string
  sizeBytes: number
}

export type WatchDecision =
  | { accepted: true }
  | {
      accepted: false
      reason: 'unsupported-type' | 'temporary' | 'hidden' | 'too-large'
    }

/** Evaluate whether a settled filesystem candidate should be captured. */
export type EvaluateWatchCandidate = (candidate: WatchCandidate) => WatchDecision
