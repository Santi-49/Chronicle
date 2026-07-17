import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#161616',
            symbolColor: '#f4f4f4',
            height: 48
          }
        }
      : {
          trafficLightPosition: { x: 16, y: 16 }
        }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
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
