/**
 * Versioning module (MVP-04) — content-addressed version capture.
 * Consumers: watcher wiring (onAccepted → captureVersion, onRemoved →
 * markFileMissing) and, later, restore (MVP-07).
 */
export { captureVersion, markFileMissing, type CaptureResult } from './capture'
export { libraryFilePathFor, snapshotToLibrary, type LibrarySnapshot } from './library'
export { readImageDimensions, type ImageDimensions } from './dimensions'
export { restoreVersion, saveVersionCopy, type RestoreVersionResult } from './restore'
