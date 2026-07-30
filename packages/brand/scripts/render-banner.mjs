import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Same ownership rule as render-pngs.mjs: the tooling is shared here, while the
// browser dependency belongs to the landing app that already needs it.
const requireFromLanding = createRequire(
  pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/landing/package.json')),
)
const { chromium } = requireFromLanding('playwright')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(scriptDir, 'banner-1920x600.html')
const output = path.resolve(scriptDir, '../assets/chronicle-banner-1920x600.png')

// The banner is a fixed-size composition, so the viewport *is* the artboard: a
// css-scaled viewport screenshot is exactly 1920x600 with no resampling.
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 600 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(source).href)
await page.waitForLoadState('networkidle')
await page.screenshot({ path: output, type: 'png' })
await browser.close()

console.log(`Rendered ${path.relative(process.cwd(), output)} at 1920x600`)
