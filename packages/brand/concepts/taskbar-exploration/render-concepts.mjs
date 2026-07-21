import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const requireFromLanding = createRequire(
  pathToFileURL(path.resolve(scriptDir, '../../../../apps/landing/package.json')),
)
const { Resvg } = requireFromLanding('@resvg/resvg-js')

const concepts = [
  { id: 'Current', name: 'Current icon', file: '../../assets/chronicle-app-icon-dark.svg', palette: 'dark plate + blue/green' },
  { id: 'A', name: 'Snapshot Clock', file: 'a-snapshot-clock.svg', palette: 'azure' },
  { id: 'B', name: 'Rewind Frame', file: 'b-rewind-frame.svg', palette: 'teal' },
  { id: 'C', name: 'Version Cascade', file: 'c-version-cascade.svg', palette: 'indigo–violet' },
  { id: 'D', name: 'Timeline Ribbon', file: 'd-timeline-ribbon.svg', palette: 'orange–amber' },
  { id: 'E', name: 'Before / After', file: 'e-before-after.svg', palette: 'blue–cyan' },
  { id: 'F', name: 'Temporal Aperture', file: 'f-temporal-aperture.svg', palette: 'violet–magenta' },
]
const sizes = [24, 32, 48, 256]
const pngDir = path.join(scriptDir, 'png')
await fs.mkdir(pngDir, { recursive: true })

for (const concept of concepts.slice(1)) {
  const svg = await fs.readFile(path.resolve(scriptDir, concept.file), 'utf8')
  for (const size of sizes) {
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    await fs.writeFile(
      path.join(pngDir, `${concept.file.replace('.svg', '')}-${size}.png`),
      image.render().asPng(),
    )
  }
}

const encoded = await Promise.all(
  concepts.map(async (concept) => {
    const svg = await fs.readFile(path.resolve(scriptDir, concept.file), 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }),
)

const cardWidth = 174
const gap = 10
const margin = 24
const width = margin * 2 + concepts.length * cardWidth + (concepts.length - 1) * gap
const height = 548
const cards = concepts.map((concept, index) => {
  const x = margin + index * (cardWidth + gap)
  const image = encoded[index]
  return `
    <g>
      <rect x="${x}" y="78" width="${cardWidth}" height="332" rx="16" fill="#ffffff" stroke="#d8dde3"/>
      <text x="${x + 14}" y="105" font-size="18" font-weight="700" fill="#111827">${concept.id}</text>
      <text x="${x + 14}" y="126" font-size="12" font-weight="600" fill="#374151">${concept.name}</text>
      <text x="${x + 14}" y="145" font-size="10" fill="#6b7280">${concept.palette}</text>
      <rect x="${x + 14}" y="162" width="146" height="108" rx="10" fill="#20262b"/>
      <image href="${image}" x="${x + 47}" y="176" width="80" height="80"/>
      <text x="${x + 24}" y="260" font-size="9" fill="#aeb7bf">dark context · 80 px</text>
      <rect x="${x + 14}" y="282" width="146" height="108" rx="10" fill="#f4f4f4" stroke="#e5e7eb"/>
      <image href="${image}" x="${x + 47}" y="296" width="80" height="80"/>
      <text x="${x + 24}" y="380" font-size="9" fill="#6b7280">light context · 80 px</text>
    </g>`
}).join('')

const taskbarIcons = concepts.map((concept, index) => {
  const center = margin + index * (cardWidth + gap) + cardWidth / 2
  return `
    <g>
      <rect x="${center - 21}" y="462" width="42" height="42" rx="5" fill="#ffffff" opacity=".055"/>
      <image href="${encoded[index]}" x="${center - 12}" y="471" width="24" height="24"/>
      <rect x="${center - 7}" y="509" width="14" height="3" rx="1.5" fill="#fb7185"/>
      <text x="${center}" y="535" text-anchor="middle" font-size="11" font-weight="700" fill="#d8dee4">${concept.id}</text>
    </g>`
}).join('')

const board = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#edf0f3"/>
  <text x="24" y="34" font-family="Segoe UI, sans-serif" font-size="24" font-weight="700" fill="#111827">Chronicle taskbar icon exploration</text>
  <text x="24" y="58" font-family="Segoe UI, sans-serif" font-size="12" fill="#4b5563">Large views expose form and palette; the bottom row is the Windows 11 taskbar size at 100% scaling (24 px).</text>
  <g font-family="Segoe UI, sans-serif">${cards}</g>
  <rect x="0" y="444" width="${width}" height="104" fill="#20262b"/>
  <g font-family="Segoe UI, sans-serif">${taskbarIcons}</g>
</svg>`

await fs.writeFile(path.join(scriptDir, 'taskbar-comparison.svg'), board)
const preview = new Resvg(board)
await fs.writeFile(path.join(scriptDir, 'taskbar-comparison.png'), preview.render().asPng())
