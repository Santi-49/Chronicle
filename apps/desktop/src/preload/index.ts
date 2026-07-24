/**
 * Preload — exposes exactly the C1 `ChronicleBridge` as `window.chronicle`
 * and nothing else. The renderer never sees Node, Electron, filesystem
 * paths, or secrets; every call crosses to main over a channel derived
 * from the shared method list (channels.ts keeps main and preload in sync
 * at compile time).
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { ChronicleBridge, ChronicleEventName, ChronicleEvents } from '../shared/ipc'
import { API_METHOD_NAMES, EVENT_NAMES, apiChannel, eventChannel } from '../main/ipc/channels'

const bridge: Record<string, unknown> = {}

function reportPreloadError(kind: 'error' | 'unhandledrejection', value: unknown): void {
  const error = value instanceof Error ? value : new Error(String(value))
  void ipcRenderer.invoke(apiChannel('reportRendererError'), {
    source: 'preload',
    kind,
    message: error.message.slice(0, 2_000),
    name: error.name.slice(0, 100),
    stack: (error.stack ?? '').slice(0, 8_000),
    occurredAt: new Date().toISOString(),
  }).catch(() => {
    // Reporting must never cause another unhandled rejection.
  })
}

process.on('uncaughtExceptionMonitor', (error) => reportPreloadError('error', error))
process.on('unhandledRejection', (reason) => reportPreloadError('unhandledrejection', reason))

for (const method of API_METHOD_NAMES) {
  bridge[method] = (...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(apiChannel(method), ...args)
}

bridge['on'] = <E extends ChronicleEventName>(
  event: E,
  listener: (payload: ChronicleEvents[E]) => void,
): (() => void) => {
  // Renderer input is untrusted: only C1 event names may be subscribed —
  // never arbitrary ipcRenderer channels.
  if (!EVENT_NAMES.includes(event)) {
    throw new TypeError(`Unknown Chronicle event: ${String(event)}`)
  }
  const channel = eventChannel(event)
  const wrapped = (_e: Electron.IpcRendererEvent, payload: ChronicleEvents[E]): void =>
    listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('chronicle', bridge as unknown as ChronicleBridge)
