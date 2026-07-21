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

await fs.mkdir(pngDir, { recursive: true })
for (const source of sources) {
  const svg = await fs.readFile(path.join(assetDir, `${source}.svg`), 'utf8')
  for (const size of sizes) {
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    await fs.writeFile(path.join(pngDir, `${source}-${size}.png`), image.render().asPng())
  }
}
