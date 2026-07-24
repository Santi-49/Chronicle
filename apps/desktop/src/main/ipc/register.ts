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
import type {
  ApplicationDiagnostic,
  ChronicleApi,
  ControlPlaneDiagnostic,
} from '../../shared/ipc'
import { createAiClient } from '../ai/client'
import { createAiServiceProcess } from '../ai/service-process'
import { createAiWorker } from '../ai/worker'
import type { ChronicleDb } from '../db/database'
import { getSetting } from '../db/repositories'
import type { AppSettings } from '../../shared/settings'
import { createControlPlaneClient, resolveControlPlaneBaseUrl } from '../gateway-client/client'
import { obtainGoogleIdToken } from '../gateway-client/google-oauth'
import { createSessionStore } from '../gateway-client/session-store'
import { createTelemetryWorker } from '../telemetry/worker'
import { createTelemetryCollector, type ErrorProcess } from '../telemetry/emitter'
import {
  createApplicationDiagnostic,
  diagnosticError,
  type ApplicationDiagnosticSink,
} from '../diagnostics'
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
  const osFamily =
    process.platform === 'win32' ? 'windows'
      : process.platform === 'darwin' ? 'macos'
        : process.platform === 'linux' ? 'linux' : 'other'
  const telemetryCollector = createTelemetryCollector(
    db,
    () => getSetting<string>(db, 'control-plane-installation-id') ?? 'unknown',
    app.getVersion(),
    osFamily,
  )
  const applicationDiagnostics: ApplicationDiagnostic[] = []
  let nextApplicationDiagnosticId = 1
  const recordDiagnosticWithProcess = (
    draft: Parameters<ApplicationDiagnosticSink>[0],
    processKind: ErrorProcess,
  ): void => {
    const entry = createApplicationDiagnostic(nextApplicationDiagnosticId++, draft)
    applicationDiagnostics.push(entry)
    if (applicationDiagnostics.length > 500) {
      applicationDiagnostics.splice(0, applicationDiagnostics.length - 500)
    }
    emit('applicationDiagnostic', entry)
    telemetryCollector.recordDiagnostic(draft, processKind)
  }
  const recordApplicationDiagnostic: ApplicationDiagnosticSink = (draft): void =>
    recordDiagnosticWithProcess(draft, 'main')

  const controlPlaneDiagnostics: ControlPlaneDiagnostic[] = []
  let nextControlPlaneDiagnosticId = 1
  const recordControlPlaneDiagnostic = (
    draft: Omit<ControlPlaneDiagnostic, 'id'>,
  ): void => {
    const entry = { ...draft, id: nextControlPlaneDiagnosticId++ }
    controlPlaneDiagnostics.push(entry)
    if (controlPlaneDiagnostics.length > 200) {
      controlPlaneDiagnostics.splice(0, controlPlaneDiagnostics.length - 200)
    }
    emit('controlPlaneDiagnostic', entry)
    if (!entry.ok) {
      recordApplicationDiagnostic({
        level: entry.status !== null && entry.status < 500 ? 'warn' : 'error',
        source: 'control-plane',
        event: entry.kind === 'health' ? 'control_plane_unhealthy' : 'control_plane_request_failed',
        message: entry.kind === 'health'
          ? `Control-plane health check failed${entry.status === null ? '' : ` with HTTP ${entry.status}`}.`
          : `${entry.method} ${entry.url} failed${entry.status === null ? '' : ` with HTTP ${entry.status}`}.`,
        context: {
          method: entry.method,
          url: entry.url,
          status: entry.status,
          durationMs: entry.durationMs,
          requestBody: entry.requestBody,
          responseBody: entry.responseBody,
          error: entry.error,
        },
      })
    }
  }

  const bundledControlPlaneUrl =
    typeof __CHRONICLE_CONTROL_PLANE_URL__ === 'undefined'
      ? ''
      : __CHRONICLE_CONTROL_PLANE_URL__
  const bundledGoogleClientId =
    typeof __GOOGLE_OAUTH_CLIENT_ID__ === 'undefined' ? '' : __GOOGLE_OAUTH_CLIENT_ID__
  const bundledGoogleClientSecret =
    typeof __GOOGLE_OAUTH_CLIENT_SECRET__ === 'undefined'
      ? ''
      : __GOOGLE_OAUTH_CLIENT_SECRET__
  const configuredControlPlaneUrl =
    process.env['CHRONICLE_CONTROL_PLANE_URL']?.trim() ||
    bundledControlPlaneUrl
  const controlPlaneBaseUrl = configuredControlPlaneUrl || 'http://localhost:8000'
  // During `npm run dev`, the repository .env is the authoritative endpoint.
  // Packaged builds retain the user's persisted override/migration behavior.
  const developmentControlPlaneUrl =
    !app.isPackaged && configuredControlPlaneUrl ? configuredControlPlaneUrl : undefined
  const account = createControlPlaneClient(
    () => resolveControlPlaneBaseUrl(
      getSetting<AppSettings>(db, 'app-settings')?.controlPlane.baseUrl,
      controlPlaneBaseUrl,
      developmentControlPlaneUrl !== undefined,
    ),
    createSessionStore(db),
    recordControlPlaneDiagnostic,
  )
  const googleClientId =
    process.env['GOOGLE_OAUTH_CLIENT_ID']?.trim() || bundledGoogleClientId
  const googleClientSecret =
    process.env['GOOGLE_OAUTH_CLIENT_SECRET']?.trim() || bundledGoogleClientSecret
  const aiClient = createAiClient()
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
    account,
    googleCredential: () => obtainGoogleIdToken(googleClientId, googleClientSecret),
    googleClientConfigured: googleClientId.length > 0,
    controlPlaneBaseUrl,
    controlPlaneBaseUrlOverride: developmentControlPlaneUrl,
    controlPlaneDiagnostics: () => [...controlPlaneDiagnostics],
    // "Data sent" clearing must not erase the latest health result used by
    // the separate Service health card.
    clearControlPlaneDiagnostics: () => {
      const retainedHealth = [...controlPlaneDiagnostics]
        .reverse()
        .find((entry) => entry.kind === 'health')
      controlPlaneDiagnostics.splice(
        0,
        controlPlaneDiagnostics.length,
        ...(retainedHealth ? [retainedHealth] : []),
      )
    },
    applicationDiagnostics: () => [...applicationDiagnostics],
    diagnostic: recordApplicationDiagnostic,
    rendererDiagnostic: (draft) => recordDiagnosticWithProcess(draft, 'renderer'),
    preloadDiagnostic: (draft) => recordDiagnosticWithProcess(draft, 'preload'),
    installation: {
      appVersion: app.getVersion(),
      osFamily,
    },
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
    aiClient,
    readApiKey: (provider) => readApiKey(db, provider),
    onTelemetryDisabled: () => telemetryWorker?.disableTelemetry() ?? Promise.resolve(),
    telemetry: telemetryCollector,
  })

  // POST-04: telemetry worker — only active when the control-plane client is configured.
  const telemetryWorker = account
      ? createTelemetryWorker({
        account,
        collector: telemetryCollector,
        getSettings: services.api.getSettings,
        isOnline: () => net.isOnline(),
        diagnostic: recordApplicationDiagnostic,
      })
    : null

  registerChronicleProtocol(libraryRoot)

  const repositoryRoot = path.resolve(app.getAppPath(), '..', '..')
  const aiProcess = createAiServiceProcess(
    repositoryRoot,
    app.isPackaged ? process.resourcesPath : undefined,
  )
  const aiWorker = createAiWorker({
    db,
    libraryRoot,
    client: aiClient,
    emit,
    getSettings: services.api.getSettings,
    readApiKey: (provider) => readApiKey(db, provider),
    isOnline: () => net.isOnline(),
    ensureService: () => aiProcess.start(),
    onQueueChanged: () => {
      void services.api.getAppStatus().then((status) => emit('statusChanged', status))
    },
    telemetry: telemetryCollector,
    diagnostic: recordApplicationDiagnostic,
  })

  const onUncaughtException = (error: Error): void => {
    recordApplicationDiagnostic({
      level: 'error',
      source: 'application',
      event: 'uncaught_exception',
      message: 'The main process encountered an uncaught exception.',
      context: { error: diagnosticError(error) },
    })
  }
  const onUnhandledRejection = (reason: unknown): void => {
    recordApplicationDiagnostic({
      level: 'error',
      source: 'application',
      event: 'unhandled_rejection',
      message: 'The main process encountered an unhandled promise rejection.',
      context: { error: diagnosticError(reason) },
    })
  }
  const onWarning = (warning: Error): void => {
    recordApplicationDiagnostic({
      level: 'warn',
      source: 'application',
      event: 'process_warning',
      message: warning.message,
      context: { error: diagnosticError(warning) },
    })
  }
  process.on('uncaughtExceptionMonitor', onUncaughtException)
  process.on('unhandledRejection', onUnhandledRejection)
  process.on('warning', onWarning)
  const onRenderProcessGone = (
    _event: Electron.Event,
    _webContents: Electron.WebContents,
    details: Electron.RenderProcessGoneDetails,
  ): void => {
    recordDiagnosticWithProcess({
      level: 'error',
      source: 'application',
      event: 'render_process_gone',
      message: `Renderer process exited unexpectedly (${details.reason}).`,
      context: { operation: 'renderer_process', reason: details.reason, exitCode: details.exitCode },
    }, 'electron')
  }
  const onChildProcessGone = (
    _event: Electron.Event,
    details: Electron.Details,
  ): void => {
    recordDiagnosticWithProcess({
      level: 'error',
      source: 'application',
      event: 'child_process_gone',
      message: `${details.type} process exited unexpectedly (${details.reason}).`,
      context: {
        operation: 'child_process',
        processType: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        serviceName: details.serviceName,
      },
    }, 'electron')
  }
  app.on('render-process-gone', onRenderProcessGone)
  app.on('child-process-gone', onChildProcessGone)

  for (const method of API_METHOD_NAMES) {
    ipcMain.handle(apiChannel(method), async (event, ...args: unknown[]) => {
      if (!isTrustedSender(event.senderFrame)) throw new Error('Untrusted IPC sender')
      try {
        return await (services.api[method] as (...a: unknown[]) => unknown)(...args)
      } catch (error) {
        recordApplicationDiagnostic({
          level: 'error',
          source: 'application',
          event: 'ipc_operation_failed',
          message: `${method} failed.`,
          context: { operation: method, error: diagnosticError(error) },
        })
        throw error
      }
    })
  }

  recordApplicationDiagnostic({
    level: 'info',
    source: 'application',
    event: 'application_started',
    message: 'Chronicle main-process diagnostics started.',
    context: {
      appVersion: app.getVersion(),
      packaged: app.isPackaged,
      controlPlaneBaseUrl: developmentControlPlaneUrl ?? controlPlaneBaseUrl,
    },
  })
  services.start()
  aiProcess.start()
  aiWorker.start()
  telemetryWorker?.start()

  return {
    api: services.api,
    async dispose() {
      for (const method of API_METHOD_NAMES) ipcMain.removeHandler(apiChannel(method))
      telemetryWorker?.stop()
      aiWorker.stop()
      process.off('uncaughtExceptionMonitor', onUncaughtException)
      process.off('unhandledRejection', onUnhandledRejection)
      process.off('warning', onWarning)
      app.off('render-process-gone', onRenderProcessGone)
      app.off('child-process-gone', onChildProcessGone)
      await aiProcess.stop()
      await services.dispose()
    },
  }
}
