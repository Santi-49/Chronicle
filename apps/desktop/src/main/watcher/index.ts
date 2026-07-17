/** Watcher module surface (MVP-03). Consumers: startup wiring and MVP-04 capture. */
export {
  MAX_FILE_BYTES,
  SETTLE_MS,
  WATCHED_EXTENSIONS,
  type EvaluateWatchCandidate,
  type WatchCandidate,
  type WatchDecision,
} from './rules'
export { evaluateWatchCandidate, hasWatchedExtension, isHiddenPath, isTemporaryPath } from './evaluate'
export {
  createFolderWatcher,
  type FolderWatcher,
  type FolderWatcherCallbacks,
  type FolderWatcherOptions,
} from './watcher'
