/**
 * Electron wiring for the C1 bridge (MVP-05): registers the chronicle://
 * image protocol, one ipcMain handler per `ChronicleApi` method, and the
 * event broadcast — everything services.ts left as injected dependencies.
 *
 * This module is deliberately thin and mechanical (it imports `electron`,
 * so tests can't load it); all behavior lives in services.ts, which is
 * tested directly.
 */
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ChronicleApi } from '../../shared/ipc'
import { createAiClient } from '../ai/client'
import { createAiServiceProcess } from '../ai/service-process'
import { createAiWorker } from '../ai/worker'
import type { ChronicleDb } from '../db/database'
import { libraryFilePathFor } from '../versioning'
import { API_METHOD_NAMES, apiChannel, eventChannel, type EmitEvent } from './channels'
import { CHRONICLE_SCHEME, chronicleUrlToHash, sniffImageContentType } from './media'
import { createSafeStorageSecretStore, readApiKey } from './secrets'
import { createChronicleServices } from './services'

export interface ChronicleIpc {
  api: ChronicleApi
  /** Removes every handler and stops the watchers (app shutdown). */
  dispose(): Promise<void>
}

/**
 * Must run before `app.whenReady()` — Electron requires scheme privileges to
 * be declared before the default session exists. `standard` gives the URLs
 * normal origin/URL parsing; `stream` lets large images stream to <img>.
 */
export function registerChronicleScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CHRONICLE_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ])
}

/**
 * Serves library bytes to the renderer as chronicle://image/<hash> (C1 rule:
 * URLs, never raw bytes or filesystem paths over IPC). The hash is validated
 * by chronicleUrlToHash, so only files inside the library are reachable.
 */
function registerChronicleProtocol(libraryRoot: string): void {
  protocol.handle(CHRONICLE_SCHEME, async (request) => {
    const hash = chronicleUrlToHash(request.url)
    if (!hash) return new Response('Not found', { status: 404 })
    const filePath = libraryFilePathFor(libraryRoot, hash)

    let head: Buffer
    try {
      const file = await fs.promises.open(filePath, 'r')
      try {
        head = Buffer.alloc(8)
        await file.read(head, 0, 8, 0)
      } finally {
        await file.close()
      }
    } catch {
      return new Response('Not found', { status: 404 })
    }

    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
      headers: {
        // Library files carry no extension — sniff the stored magic bytes.
        'content-type': sniffImageContentType(head),
        // Content-addressed = immutable: the same URL can never change bytes.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  })
}

/** Only frames we loaded ourselves may call handlers (Electron IPC guidance). */
function isTrustedSender(frame: Electron.WebFrameMain | null | undefined): boolean {
  if (!frame) return false
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return (devUrl !== undefined && frame.url.startsWith(devUrl)) || frame.url.startsWith('file://')
}

/** Push events to every open window (MVP has one, but new windows just work). */
const emit: EmitEvent = (event, payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(eventChannel(event), payload)
  }
}

/** Call once after `app.whenReady()`; returns the live api and a disposer. */
export function startChronicleIpc(db: ChronicleDb, libraryRoot: string): ChronicleIpc {
  const services = createChronicleServices({
    db,
    libraryRoot,
    emit,
    pickFolder: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!
    },
    pickVersionCopyPath: async (suggestedName) => {
      const result = await dialog.showSaveDialog({
        title: 'Save a version copy',
        defaultPath: suggestedName,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }],
      })
      return result.canceled || !result.filePath ? null : result.filePath
    },
    secrets: createSafeStorageSecretStore(db),
    isOnline: () => net.isOnline(),
    setWindowTheme: (theme) => {
      if (process.platform === 'darwin') return
      const dark = theme === 'dark'
      for (const win of BrowserWindow.getAllWindows()) {
        win.setTitleBarOverlay({
          color: dark ? '#161616' : '#ffffff',
          symbolColor: dark ? '#f4f4f4' : '#161616',
          height: 48,
        })
      }
    },
  })

  registerChronicleProtocol(libraryRoot)

  // In development app.getAppPath() is apps/desktop; the Python module is
  // imported from the repository root. Bundling the sidecar is stretch scope.
  const repositoryRoot = path.resolve(app.getAppPath(), '..', '..')
  const aiProcess = createAiServiceProcess(repositoryRoot)
  const aiWorker = createAiWorker({
    db,
    libraryRoot,
    client: createAiClient(),
    emit,
    getSettings: services.api.getSettings,
    readApiKey: (provider) => readApiKey(db, provider),
    isOnline: () => net.isOnline(),
    ensureService: () => aiProcess.start(),
    onQueueChanged: () => {
      void services.api.getAppStatus().then((status) => emit('statusChanged', status))
    },
  })

  for (const method of API_METHOD_NAMES) {
    ipcMain.handle(apiChannel(method), (event, ...args: unknown[]) => {
      if (!isTrustedSender(event.senderFrame)) throw new Error('Untrusted IPC sender')
      return (services.api[method] as (...a: unknown[]) => unknown)(...args)
    })
  }

  services.start()
  aiProcess.start()
  aiWorker.start()

  return {
    api: services.api,
    async dispose() {
      for (const method of API_METHOD_NAMES) ipcMain.removeHandler(apiChannel(method))
      aiWorker.stop()
      await aiProcess.stop()
      await services.dispose()
    },
  }
}
