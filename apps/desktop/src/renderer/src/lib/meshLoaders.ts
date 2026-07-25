/**
 * Geometry loaders for the 3D viewer, one per mesh format.
 *
 * Each loader turns the stored bytes of a version into a three.js geometry.
 * They are selected from the format registry, so adding a mesh format means
 * adding one entry here — the viewer itself stays format-agnostic.
 *
 * Everything is dynamically imported: the CAD tessellator is a WebAssembly
 * module and is only fetched when a STEP version is actually opened.
 */
import type { BufferGeometry } from 'three'
import type { FormatId } from '../../../shared/formats'

type Three = typeof import('three')

type Loader = (bytes: ArrayBuffer, three: Three) => Promise<BufferGeometry>

/** Wavefront OBJ — three.js ships a loader for it. */
const loadObj: Loader = async (bytes, three) => {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
  const group = new OBJLoader().parse(new TextDecoder().decode(bytes))

  // An OBJ file can hold several objects; merge their geometries so the viewer
  // handles a single one. Attributes are appended in the same order.
  const geometries: BufferGeometry[] = []
  group.traverse((child) => {
    const geometry = (child as { geometry?: BufferGeometry }).geometry
    if (geometry?.attributes['position']) geometries.push(geometry.toNonIndexed())
  })
  if (geometries.length === 0) throw new Error('This OBJ file contains no geometry.')

  const merged = geometries.length === 1 ? geometries[0]! : mergePositions(three, geometries)
  merged.computeVertexNormals()
  return merged
}

/**
 * STEP — tessellated by OpenCascade compiled to WebAssembly. Runs here in the
 * renderer rather than in the main process so a heavy CAD assembly can never
 * stall capture, IPC, or the watcher.
 */
const loadStep: Loader = async (bytes, three) => {
  const { default: initOcct } = await import('occt-import-js')
  const occt = await initOcct()

  const result = occt.ReadStepFile(new Uint8Array(bytes), null)
  if (!result.success || result.meshes.length === 0) {
    throw new Error('This STEP file could not be tessellated.')
  }

  const geometries = result.meshes.map((mesh) => {
    const geometry = new three.BufferGeometry()
    geometry.setAttribute(
      'position',
      new three.Float32BufferAttribute(mesh.attributes.position.array, 3),
    )
    if (mesh.attributes.normal) {
      geometry.setAttribute(
        'normal',
        new three.Float32BufferAttribute(mesh.attributes.normal.array, 3),
      )
    }
    if (mesh.index) geometry.setIndex(mesh.index.array)
    return geometry.toNonIndexed()
  })

  const merged = geometries.length === 1 ? geometries[0]! : mergePositions(three, geometries)
  if (!merged.attributes['normal']) merged.computeVertexNormals()
  return merged
}

const LOADERS: Partial<Record<FormatId, Loader>> = {
  obj: loadObj,
  step: loadStep,
}

/** Fetch a version's stored bytes and turn them into displayable geometry. */
export async function loadMeshGeometry(
  src: string,
  format: FormatId,
  three: Three,
): Promise<BufferGeometry> {
  const load = LOADERS[format]
  if (!load) throw new Error(`No 3D loader for ${format} files.`)
  const response = await fetch(src)
  if (!response.ok) throw new Error('The stored file could not be read.')
  return load(await response.arrayBuffer(), three)
}

/** Concatenate position (and normal) attributes of non-indexed geometries. */
function mergePositions(three: Three, geometries: BufferGeometry[]): BufferGeometry {
  const merged = new three.BufferGeometry()
  for (const name of ['position', 'normal'] as const) {
    if (!geometries.every((geometry) => geometry.attributes[name])) continue
    const total = geometries.reduce(
      (sum, geometry) => sum + geometry.attributes[name]!.array.length,
      0,
    )
    const values = new Float32Array(total)
    let offset = 0
    for (const geometry of geometries) {
      values.set(geometry.attributes[name]!.array as Float32Array, offset)
      offset += geometry.attributes[name]!.array.length
    }
    merged.setAttribute(name, new three.BufferAttribute(values, 3))
  }
  geometries.forEach((geometry) => geometry.dispose())
  return merged
}
