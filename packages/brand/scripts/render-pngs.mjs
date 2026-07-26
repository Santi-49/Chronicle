import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Asset tooling is shared, while the dependency is owned by the landing app
// that consumes these exports. createRequire resolves from that package.
const requireFromLanding = createRequire(
  pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/landing/package.json')),
)
const { Resvg } = requireFromLanding('@resvg/resvg-js')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const assetDir = path.resolve(scriptDir, '../assets')
const pngDir = path.join(assetDir, 'png')
const sources = [
  'chronicle-mark-light',
  'chronicle-mark-dark',
  'chronicle-app-icon-light',
  'chronicle-app-icon-dark',
]
const sizes = [32, 64, 128, 256, 512]

// Tray/menu-bar icons reuse the app-icon artwork — the tray should read as the
// same Chronicle the taskbar shows — but are exported separately because the
// shell wants its own naming and sizing: a 16 px base with an `@2x` companion,
// which Electron's nativeImage resolves automatically for HiDPI displays.
const trayDir = path.join(pngDir, 'tray')
const traySources = ['chronicle-app-icon-light', 'chronicle-app-icon-dark']

await fs.mkdir(pngDir, { recursive: true })
for (const source of sources) {
  const svg = await fs.readFile(path.join(assetDir, `${source}.svg`), 'utf8')
  for (const size of sizes) {
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    await fs.writeFile(path.join(pngDir, `${source}-${size}.png`), image.render().asPng())
  }
}

await fs.mkdir(trayDir, { recursive: true })
for (const source of traySources) {
  const svg = await fs.readFile(path.join(assetDir, `${source}.svg`), 'utf8')
  for (const [size, suffix] of [[16, ''], [32, '@2x']]) {
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    await fs.writeFile(path.join(trayDir, `${source}${suffix}.png`), image.render().asPng())
  }
}
