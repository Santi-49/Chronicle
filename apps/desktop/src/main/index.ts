import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import path from 'node:path'
import { openAppDatabase, type ChronicleDb } from './db'
import { registerChronicleScheme, startChronicleIpc, type ChronicleIpc } from './ipc/register'
import { ensureAppDirs, libraryDir } from './paths'

/** Single app-lifetime database handle; the IPC services receive this. */
let db: ChronicleDb
let ipc: ChronicleIpc | undefined

// Development uses the repository-root .env. Production deployments should
// inject the public desktop client ID at build/startup; secrets are never bundled.
loadEnv({ path: path.resolve(app.getAppPath(), '..', '..', '.env'), quiet: true })

// Scheme privileges must be declared before the app is ready.
registerChronicleScheme()

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

  // electron-vite dev server URL in dev, bundled file in production
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('app.chronicle.desktop')
  ensureAppDirs()
  db = openAppDatabase()

  // C1 bridge: chronicle:// protocol, ipcMain handlers, and the watcher →
  // capture pipeline for every tracked folder.
  ipc = startChronicleIpc(db, libraryDir())

  // Windows and Linux otherwise add Electron's default File/Edit/View/Window row.
  // macOS keeps its platform-standard application menu at the top of the screen.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // Best-effort: stop the folder watchers so shutdown doesn't leak handles.
  void ipc?.dispose()
})
