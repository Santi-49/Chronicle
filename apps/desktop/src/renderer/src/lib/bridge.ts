/**
 * Typed accessor for the C1 bridge the preload exposes as `window.chronicle`.
 *
 * The renderer never touches Node, Electron, the filesystem, or secrets — it
 * only ever calls these methods (src/shared/ipc.ts is the single contract).
 */
import type { ChronicleBridge } from '../../../shared/ipc'

declare global {
  interface Window {
    chronicle: ChronicleBridge
  }
}

if (typeof window === 'undefined' || !window.chronicle) {
  // A hard failure here means the preload did not run — never ship a silent
  // half-working renderer.
  throw new Error('window.chronicle is unavailable — the Electron preload bridge did not load.')
}

export const chronicle: ChronicleBridge = window.chronicle
