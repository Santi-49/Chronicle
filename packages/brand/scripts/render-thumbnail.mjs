import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Same ownership rule as render-banner.mjs: the tooling is shared here, while the
// browser dependency belongs to the landing app that already needs it.
const requireFromLanding = createRequire(
  pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/landing/package.json')),
)
const { chromium } = requireFromLanding('playwright')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(scriptDir, 'thumbnail-1280x720.html')
const output = path.resolve(scriptDir, '../assets/chronicle-youtube-thumbnail-1280x720.png')

// 1280x720 is YouTube's minimum thumbnail size, so the artboard is the viewport
// and the screenshot needs no resampling (same trick as the banner).
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(source).href)
await page.waitForLoadState('networkidle')
await page.screenshot({ path: output, type: 'png' })
await browser.close()

console.log(`Rendered ${path.relative(process.cwd(), output)} at 1280x720`)
