/**
 * 3D loader tests.
 *
 * These exercise the real libraries (three.js, and the OpenCascade WebAssembly
 * tessellator for STEP) rather than mocks, because the risk being covered is
 * exactly whether those libraries produce usable geometry from stored bytes.
 *
 * The STEP case needs a real CAD file. Rather than redistribute a third-party
 * model, it borrows one of `occt-import-js`'s own test files and skips when
 * that file is not present.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as three from 'three'
import { objCube } from '../../../main/formats/fixtures'
import { loadMeshGeometry } from './meshLoaders'

/** Serve fixture bytes through the fetch() the loader uses for chronicle:// URLs. */
function serve(bytes: Buffer | string): void {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  }))
}

const PACKAGE_ROOT = path.join(__dirname, '../../../../node_modules/occt-import-js')
const STEP_FIXTURE = path.join(PACKAGE_ROOT, 'test/testfiles/simple-basic-cube/cube.stp')

/**
 * In the bundled renderer the `?url` import resolves to an emitted asset next
 * to the page. Under the Node-based test runner there is no such asset, so the
 * WebAssembly binary is pointed at its real location on disk instead.
 */
vi.mock('occt-import-js/dist/occt-import-js.wasm?url', () => ({
  default: path.join(PACKAGE_ROOT, 'dist/occt-import-js.wasm'),
}))

describe('loadMeshGeometry', () => {
  it('loads an OBJ file into positioned, normalled geometry', async () => {
    serve(objCube())
    const geometry = await loadMeshGeometry('chronicle://image/obj/x', 'obj', three)

    // 6 quads → 12 triangles → 36 non-indexed vertices.
    expect(geometry.attributes['position']!.count).toBe(36)
    expect(geometry.attributes['normal']).toBeDefined()
    geometry.computeBoundingSphere()
    expect(geometry.boundingSphere!.radius).toBeCloseTo(Math.sqrt(3), 5)
  })

  it('rejects an OBJ file with no geometry', async () => {
    serve('# a comment and nothing else\n')
    await expect(loadMeshGeometry('chronicle://image/obj/x', 'obj', three)).rejects.toThrow(
      /no geometry/,
    )
  })

  it('reports an unreadable stored file instead of rendering nothing', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }))
    await expect(loadMeshGeometry('chronicle://image/obj/x', 'obj', three)).rejects.toThrow(
      /could not be read/,
    )
  })

  it('has no loader for a format that is not a mesh', async () => {
    serve('irrelevant')
    await expect(loadMeshGeometry('chronicle://image/png/x', 'png', three)).rejects.toThrow(
      /No 3D loader/,
    )
  })

  it.skipIf(!fs.existsSync(STEP_FIXTURE))(
    'tessellates a real STEP file into triangles',
    async () => {
      serve(fs.readFileSync(STEP_FIXTURE))
      const geometry = await loadMeshGeometry('chronicle://image/step/x', 'step', three)

      const positions = geometry.attributes['position']!
      expect(positions.count).toBeGreaterThan(0)
      expect(positions.count % 3).toBe(0) // whole triangles
      expect(geometry.attributes['normal']).toBeDefined()
      geometry.computeBoundingSphere()
      expect(geometry.boundingSphere!.radius).toBeGreaterThan(0)
    },
    30_000,
  )

  it.skipIf(!fs.existsSync(STEP_FIXTURE))('rejects content that is not CAD data', async () => {
    serve('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n')
    await expect(loadMeshGeometry('chronicle://image/step/x', 'step', three)).rejects.toThrow(
      /could not be tessellated/,
    )
  }, 30_000)
})
