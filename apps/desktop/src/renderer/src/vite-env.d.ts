/// <reference types="vite/client" />

import type { ChronicleBridge } from '../../shared/ipc'

declare global {
  const __APP_VERSION__: string
  const __CHRONICLE_LANDING_URL__: string
  interface Window {
    chronicle: ChronicleBridge
  }
}
