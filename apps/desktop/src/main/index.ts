import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import path from 'node:path'
import { createAiClient } from './ai/client'
import {
  parseProbeArguments,
  PROVIDER_PROBE_HELP,
  runProviderProbe,
} from './ai/probe-cli'
import { createAiServiceProcess } from './ai/service-process'
import { getSetting, openAppDatabase, setSetting, type ChronicleDb } from './db'
import {
  registerChronicleScheme,
  startChronicleIpc,
  type ChronicleIpc,
  type SystemIntegrationHost,
} from './ipc/register'
import { readApiKey } from './ipc/secrets'
import { ensureAppDirs, libraryDir, previewDir } from './paths'
import { createLifecycleController, type LifecycleController } from './system/lifecycle'
import {
  createLoginItemController,
  shouldStartHidden,
  type LoginItemController,
} from './system/login-item'
import { createTrayController, type TrayController } from './system/tray'

/** Single app-lifetime database handle; the IPC services receive this. */
let db: ChronicleDb
let ipc: ChronicleIpc | undefined
let tray: TrayController | undefined
let lifecycle: LifecycleController | undefined
let loginItem: LoginItemController | undefined
let mainWindow: BrowserWindow | null = null

/** Live mirror of C5 `system.runInBackground`, read once at startup. */
let runInBackground = false

/** Settings key for the one-time "still running in the tray" notice. */
const BACKGROUND_NOTICE_KEY = 'background-notice-shown'

/**
 * The provider probe is a short-lived CLI run (`--probe-ai-models`), so it must
 * not contend for the single-instance lock or be redirected into a running
 * window.
 */
const isProbeRun = process.argv.includes('--probe-ai-models')

// Development uses the repository-root .env. Production deployments should
// inject the public desktop client ID at build/startup; secrets are never bundled.
loadEnv({ path: path.resolve(app.getAppPath(), '..', '..', '.env'), quiet: true })

// Scheme privileges must be declared before the app is ready.
registerChronicleScheme()

/**
 * Exactly one Chronicle may own the library. Previously implicit — closing the
 * window quit the app — but a tray-resident process is reachable from the Start
 * menu and desktop shortcut while hidden, and a second process would open the
 * same SQLite file and start a second watcher over the same folders: duplicate
 * captures and lock contention. The second launch hands over to the first.
 */
const hasInstanceLock = isProbeRun || app.requestSingleInstanceLock()
if (!hasInstanceLock) app.quit()

app.on('second-instance', () => showMainWindow())

/** Reveals the window, creating one if a close already disposed of it. */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** The only path to a real exit: latch the flag first so no close is swallowed. */
function quitApplication(): void {
  lifecycle?.beginQuit()
  app.quit()
}

function createWindow(): void {
  const dark = nativeTheme.shouldUseDarkColors
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, 'chronicle-app-icon.png')
    : path.resolve(app.getAppPath(), '..', '..', 'packages', 'brand', 'assets', 'png', 'chronicle-app-icon-dark-256.png')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: dark ? '#161616' : '#ffffff',
            symbolColor: dark ? '#f4f4f4' : '#161616',
            height: 48
          }
        }
      : {
          trafficLightPosition: { x: 16, y: 16 }
        }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // C1 security boundary: the renderer gets no Node access — only the
      // typed bridge the preload exposes. These are Electron's defaults,
      // stated explicitly so a future edit can't silently weaken them.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Landing-site links must open in the user's browser, never in an Electron window
  // with application privileges. The build-time landing origin is the only
  // renderer-created window destination allowed through to the system browser.
  let landingOrigin: string | null = null
  try {
    const landingUrl = new URL(__CHRONICLE_LANDING_URL__)
    if (landingUrl.protocol === 'https:' || landingUrl.protocol === 'http:') {
      landingOrigin = landingUrl.origin
    }
  } catch {
    // An invalid build-time URL leaves external navigation safely disabled.
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const destination = new URL(url)
      if (
        landingOrigin &&
        destination.origin === landingOrigin &&
        (destination.protocol === 'https:' || destination.protocol === 'http:')
      ) {
        void shell.openExternal(destination.toString())
      }
    } catch {
      // Deny malformed URLs.
    }
    return { action: 'deny' }
  })

  // Background capture: a close becomes a hide, so the watcher, capture
  // pipeline, and AI queue keep running. `shouldHideOnClose` refuses once
  // anything has begun quitting — including the updater's restart — and refuses
  // when no tray icon exists, because then there would be no way back or out.
  win.on('close', (event) => {
    if (!lifecycle?.shouldHideOnClose()) return
    event.preventDefault()
    win.hide()
    // Closing a window normally means quitting, so say once that it did not.
    if (!getSetting<boolean>(db, BACKGROUND_NOTICE_KEY)) {
      setSetting(db, BACKGROUND_NOTICE_KEY, true)
      tray?.notifyRunningInBackground()
    }
  })

  mainWindow = win

  // electron-vite dev server URL in dev, bundled file in production
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/** Directory holding the rendered tray PNGs, in both dev and packaged layouts. */
function trayIconRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tray')
    : path.resolve(app.getAppPath(), '..', '..', 'packages', 'brand', 'assets', 'png', 'tray')
}

app.whenReady().then(async () => {
  // The lock holder is already handling this launch; open no database and start
  // no watcher here, or two processes would briefly share the library.
  if (!hasInstanceLock) return

  if (process.platform === 'win32') app.setAppUserModelId('app.chronicle.desktop')
  db = openAppDatabase()

  if (process.argv.includes('--probe-ai-models')) {
    try {
      const probeMarker = process.argv.indexOf('--probe-ai-models')
      const args = parseProbeArguments(process.argv.slice(probeMarker + 1))
      if (args.help) {
        console.log(PROVIDER_PROBE_HELP)
        db.close()
        app.exit(0)
        return
      }
      const repositoryRoot = path.resolve(app.getAppPath(), '..', '..')
      // Use an isolated port so the probe always runs the current workspace
      // code, even while a desktop dev session has an older sidecar on 8765.
      const probePort = 8877
      const aiProcess = createAiServiceProcess(
        repositoryRoot,
        app.isPackaged ? process.resourcesPath : undefined,
        probePort,
      )
      const exitCode = await runProviderProbe(args, {
        db,
        client: createAiClient(`http://127.0.0.1:${probePort}`),
        readApiKey: (provider) => readApiKey(db, provider),
        ensureService: () => aiProcess.start(),
      })
      await aiProcess.stop()
      db.close()
      app.exit(exitCode)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      db.close()
      app.exit(2)
    }
    return
  }

  ensureAppDirs()

  lifecycle = createLifecycleController({
    runInBackground: () => runInBackground,
    trayActive: () => tray?.active() ?? false,
  })
  loginItem = createLoginItemController({
    adapter: app,
    platform: process.platform,
    packaged: app.isPackaged,
  })

  // The tray and window belong to this module, so the IPC layer receives them
  // as an injected host rather than importing them. Every method reads live
  // state, because the tray is created after the bridge starts.
  const systemIntegration: SystemIntegrationHost = {
    getState: () => ({
      openAtLoginSupported: loginItem?.supported ?? false,
      openAtLogin: loginItem?.read() ?? false,
      trayActive: tray?.active() ?? false,
      unsupportedReason: loginItem?.unsupportedReason ?? null,
    }),
    setOpenAtLogin: (enabled, opensWindow) => {
      loginItem?.write(enabled, opensWindow ? 'window' : 'background')
      return systemIntegration.getState()
    },
    applyRunInBackground: (enabled) => {
      runInBackground = enabled
      if (enabled) tray?.enable()
      else tray?.disable()
    },
  }

  // C1 bridge: chronicle:// protocol, ipcMain handlers, and the watcher →
  // capture pipeline for every tracked folder.
  ipc = startChronicleIpc(db, libraryDir(), previewDir(), systemIntegration)

  // Windows and Linux otherwise add Electron's default File/Edit/View/Window row.
  // macOS keeps its platform-standard application menu at the top of the screen.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

  const settings = await ipc.api.getSettings()
  runInBackground = settings.system.runInBackground
  tray = createTrayController({
    iconRoot: trayIconRoot(),
    showWindow: showMainWindow,
    quit: quitApplication,
  })
  // enable() reports its own failure and stays inactive, which the lifecycle
  // rules read as "closing must quit" — the app can never become unquittable
  // because a shell has no notification area.
  if (runInBackground) tray.enable()

  // A login launch in background mode resumes capture with no window; anything
  // else — including a normal launch — opens the UI.
  if (
    !shouldStartHidden({
      argv: process.argv,
      openedAtLogin: app.getLoginItemSettings().wasOpenedAtLogin,
      // macOS restores a login item without our argument, so the remembered
      // mode is what says whether a window was wanted there.
      loginMode: settings.system.openAtLoginOpensWindow ? 'window' : 'background',
      trayAvailable: tray.active(),
    })
  ) {
    createWindow()
  }
  ipc.startUpdater()

  app.on('activate', () => showMainWindow())
})

app.on('window-all-closed', () => {
  if (lifecycle?.shouldQuitWhenAllWindowsClosed() ?? process.platform !== 'darwin') app.quit()
})

/** Runs at most once; every quit route waits on this same promise. */
let shutdown: Promise<void> | null = null

/**
 * Stop the watchers and the Python AI sidecar *before* the process exits.
 *
 * This has to be awaited, not fired and forgotten. The sidecar is a spawned
 * child that Windows does not reap with its parent, so an Electron process that
 * exits first leaves a live `chronicle-ai-sidecar.exe` behind — one per session,
 * accumulating, each still holding port 8765 and a lock on its own executable
 * (which is also what breaks the next packaging run and would block an
 * installer from replacing it during an update).
 *
 * Bounded, because an unquittable app is worse than a leaked child: if disposal
 * has not finished in time, the quit proceeds anyway.
 */
function beginShutdown(): Promise<void> {
  shutdown ??= (async () => {
    tray?.dispose()
    await Promise.race([
      ipc?.dispose() ?? Promise.resolve(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ])
  })()
  return shutdown
}

// Covers every exit route that does not go through the tray: Cmd+Q, the
// updater's quitAndInstall, and the OS asking the app to close at logout.
app.on('before-quit', (event) => {
  lifecycle?.beginQuit()
  // Second pass — disposal already ran or is running, so let the quit through.
  if (shutdown) return
  event.preventDefault()
  void beginShutdown().finally(() => app.quit())
})

// Fallback for a quit that never reached the handler above.
app.on('will-quit', () => {
  void beginShutdown()
})
