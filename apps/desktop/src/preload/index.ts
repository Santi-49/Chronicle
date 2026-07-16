import { contextBridge } from 'electron'

// IPC surface is defined at the interfaces milestone (docs/challenge/CONSTRAINTS.md).
// Until then the bridge only exposes the app version so the wiring is testable.
contextBridge.exposeInMainWorld('chronicle', {
  version: process.env['npm_package_version'] ?? 'dev'
})
