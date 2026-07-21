/// <reference types="vite/client" />

import type { ChronicleBridge } from '../../shared/ipc'

declare global {
  interface Window {
    chronicle: ChronicleBridge
  }
}
