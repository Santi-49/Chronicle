/**
 * C4 implementation — decides whether a settled filesystem candidate becomes
 * a capture candidate (spec F2/F3). Pure functions, no filesystem access.
 */
import path from 'node:path'
import {
  MAX_FILE_BYTES,
  WATCHED_EXTENSIONS,
  type EvaluateWatchCandidate,
  type WatchDecision,
} from './rules'

/**
 * Temp/backup/lock names real editors write while saving. Everything here is
 * rejected as 'temporary' before the extension check so `logo.png.tmp` is
 * classified as a temp write, not as an unsupported type.
 */
const TEMP_BASENAME_PATTERNS: readonly RegExp[] = [
  /^~\$/, // Office owner/lock files (~$logo.docx style)
  // (dot-prefixed lock files like emacs ".#file" are already caught as hidden)
  /^#.*#$/, // emacs autosave
  /~$/, // trailing-tilde backups (gedit, some editors)
  /\.(tmp|temp|bak|old|part|partial|crdownload|download|swp|swo|swx)$/i,
]

/** True when any path segment is dot-prefixed (hidden by convention). */
export function isHiddenPath(filePath: string): boolean {
  return filePath
    .split(/[\\/]/)
    .some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..')
}

/** True when the basename matches a known temp/backup/lock naming pattern. */
export function isTemporaryPath(filePath: string): boolean {
  const base = path.basename(filePath)
  return TEMP_BASENAME_PATTERNS.some((pattern) => pattern.test(base))
}

/** True when the extension is one of WATCHED_EXTENSIONS (case-insensitive). */
export function hasWatchedExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return (WATCHED_EXTENSIONS as readonly string[]).includes(ext)
}

/**
 * C4 decision, checked in order: hidden → temporary → unsupported-type →
 * too-large. A file at exactly MAX_FILE_BYTES is accepted; only files *over*
 * the cap are skipped (F3.6).
 *
 * Note: the hidden check looks at every segment of the given path, so paths
 * are expected to be inside a tracked folder that itself has no dot-prefixed
 * segments (see watcher README — a dotted tracked root is unsupported).
 */
export const evaluateWatchCandidate: EvaluateWatchCandidate = (candidate): WatchDecision => {
  if (isHiddenPath(candidate.path)) return { accepted: false, reason: 'hidden' }
  if (isTemporaryPath(candidate.path)) return { accepted: false, reason: 'temporary' }
  if (!hasWatchedExtension(candidate.path)) return { accepted: false, reason: 'unsupported-type' }
  if (candidate.sizeBytes > MAX_FILE_BYTES) return { accepted: false, reason: 'too-large' }
  return { accepted: true }
}
