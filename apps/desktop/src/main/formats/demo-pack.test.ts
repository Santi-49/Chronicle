/**
 * Acceptance test for the committed demo pack (`demo-assets/sources/`).
 *
 * The pack is written from the format specifications by
 * `scripts/demo_assets.py`, so the question worth answering is not whether
 * Python produced bytes but whether **Chronicle understands them**: the C4
 * watcher accepts every file, the registry resolves its format, its metadata
 * parses, and its preview or 3D geometry can actually be produced.
 *
 * This is also the regression guard for the pack itself — a format writer that
 * drifts from the specification fails here rather than in a demo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FORMATS, formatForPath, type FormatId } from '../../shared/formats'
import { evaluateWatchCandidate } from '../watcher/evaluate'
import { createFormatPreview, readFormatDimensions } from './index'
import { readBlendHeader } from './blend'
import { parseObj } from './obj'

const SOURCES = path.resolve(__dirname, '../../../../../demo-assets/sources')

/** Every committed source file, grouped by the asset directory it belongs to. */
function sourceFiles(): string[] {
  if (!fs.existsSync(SOURCES)) return []
  return fs
    .readdirSync(SOURCES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      fs
        .readdirSync(path.join(SOURCES, entry.name))
        .sort()
        .map((name) => path.join(SOURCES, entry.name, name)),
    )
}

const files = sourceFiles()
const byFormat = new Map<FormatId, string[]>()
for (const file of files) {
  const format = formatForPath(file)
  if (format) byFormat.set(format.id, [...(byFormat.get(format.id) ?? []), file])
}

/** Tessellate STEP with the same kernel the renderer's 3D viewer uses. */
async function tessellate(file: string): Promise<number> {
  const root = path.resolve(__dirname, '../../../node_modules/occt-import-js')
  const { default: init } = (await import(
    pathToFileURL(path.join(root, 'dist/occt-import-js.js')).href
  )) as { default: (options: { locateFile: () => string }) => Promise<OcctRuntime> }
  const occt = await init({ locateFile: () => path.join(root, 'dist/occt-import-js.wasm') })
  const result = occt.ReadStepFile(new Uint8Array(fs.readFileSync(file)), null)
  expect(result.success, file).toBe(true)
  return result.meshes.reduce(
    (total, mesh) => total + mesh.attributes.position.array.length / 3,
    0,
  )
}

interface OcctRuntime {
  ReadStepFile(
    content: Uint8Array,
    params: null,
  ): { success: boolean; meshes: { attributes: { position: { array: number[] } } }[] }
}

describe.skipIf(files.length === 0)('committed demo pack', () => {
  it('covers the formats the pack claims, three versions each', () => {
    // PNG is deliberately absent: JPG already covers the raster + AI path, and
    // the pack favours one strong asset per format over near-duplicates.
    expect([...byFormat.keys()].sort()).toEqual([
      'blend',
      'jpg',
      'obj',
      'psb',
      'psd',
      'step',
      'svg',
    ])
    for (const asset of fs.readdirSync(SOURCES)) {
      expect(fs.readdirSync(path.join(SOURCES, asset)).length, `${asset} versions`).toBe(3)
    }
  })

  it('is entirely capturable: the watcher accepts every file', () => {
    for (const file of files) {
      const decision = evaluateWatchCandidate({
        path: file,
        sizeBytes: fs.statSync(file).size,
      })
      expect(decision, path.basename(file)).toEqual({ accepted: true })
    }
  })

  it('parses dimensions for every format that reports them', async () => {
    for (const id of ['png', 'jpg', 'svg', 'psd', 'psb'] as FormatId[]) {
      for (const file of byFormat.get(id) ?? []) {
        const size = await readFormatDimensions(file, id)
        expect(size, path.basename(file)).not.toBeNull()
        expect(size!.width, path.basename(file)).toBeGreaterThan(0)
        expect(size!.height, path.basename(file)).toBeGreaterThan(0)
      }
    }
  })

  it('produces a preview for every format that needs one', async () => {
    for (const format of FORMATS.filter((entry) => entry.preview === 'derived')) {
      for (const file of byFormat.get(format.id) ?? []) {
        const preview = await createFormatPreview(file, format.id)
        expect(preview, path.basename(file)).not.toBeNull()
        expect(preview!.bytes.length, path.basename(file)).toBeGreaterThan(64)
      }
    }
  })

  it('reads the Blender header of the compressed save', async () => {
    const headers = await Promise.all(
      (byFormat.get('blend') ?? []).map((file) => readBlendHeader(file)),
    )
    expect(headers.every((header) => header !== null)).toBe(true)
    // The pack uses Blender's "Compress" save option, so the preview has to be
    // recovered through a bounded decompression rather than read in place.
    expect(headers.every((header) => header!.compressed)).toBe(true)
  })

  it('loads real geometry from every mesh asset', async () => {
    for (const file of byFormat.get('obj') ?? []) {
      const mesh = await parseObj(file)
      expect(mesh.vertices.length, path.basename(file)).toBeGreaterThan(0)
      expect(mesh.triangles.length, path.basename(file)).toBeGreaterThan(0)
      expect(mesh.truncated, path.basename(file)).toBe(false)
    }
  })

  it('tessellates every STEP asset through the CAD kernel', async () => {
    for (const file of byFormat.get('step') ?? []) {
      expect(await tessellate(file), path.basename(file)).toBeGreaterThan(0)
    }
  }, 60_000)
})
