/**
 * Shared 3D helpers: a small triangle-mesh type and a deterministic
 * SVG rendering of one, used as the still thumbnail for mesh formats.
 *
 * SVG rather than a bitmap on purpose — Chromium renders it natively, it stays
 * a few kilobytes, and it needs neither a GPU in the main process nor a raster
 * encoder. The interactive view (renderer, three.js) uses the original bytes.
 */

export interface Mesh {
  /** Flat XYZ triples. */
  vertices: Float64Array
  /** Vertex-index triples into `vertices`. */
  triangles: Uint32Array
  /** True when parsing stopped at a safety bound, so the preview is partial. */
  truncated: boolean
}

export const EMPTY_MESH: Mesh = {
  vertices: new Float64Array(0),
  triangles: new Uint32Array(0),
  truncated: false,
}

/** Triangles kept in a thumbnail. Beyond this the mesh is evenly sampled. */
const MAX_DRAWN_TRIANGLES = 4_000
const SIZE = 512
const MARGIN = 24

/** A fixed three-quarter view, so a version's preview is reproducible. */
const YAW = Math.PI / 5
const PITCH = Math.PI / 7

function rotate(x: number, y: number, z: number): [number, number, number] {
  // Yaw around Y, then pitch around X — camera-independent and cheap.
  const cy = Math.cos(YAW)
  const sy = Math.sin(YAW)
  const cx = Math.cos(PITCH)
  const sx = Math.sin(PITCH)
  const rx = x * cy + z * sy
  const rz = -x * sy + z * cy
  return [rx, y * cx - rz * sx, y * sx + rz * cx]
}

/** Even sampling that always keeps the first and last triangle. */
function sampleStride(total: number): number {
  return total <= MAX_DRAWN_TRIANGLES ? 1 : Math.ceil(total / MAX_DRAWN_TRIANGLES)
}

/**
 * Render a mesh as a flat-shaded SVG. Returns null for an empty mesh so the
 * caller can fall back to the format placeholder rather than an empty frame.
 */
export function meshToSvg(mesh: Mesh, accent = '#4589ff'): string | null {
  const vertexCount = mesh.vertices.length / 3
  if (vertexCount === 0) return null

  // Project every vertex once, then scale the whole cloud into the viewport.
  const projected = new Float64Array(vertexCount * 3)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let index = 0; index < vertexCount; index++) {
    const [x, y, z] = rotate(
      mesh.vertices[index * 3]!,
      mesh.vertices[index * 3 + 1]!,
      mesh.vertices[index * 3 + 2]!,
    )
    projected[index * 3] = x
    projected[index * 3 + 1] = y
    projected[index * 3 + 2] = z
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const span = Math.max(maxX - minX, maxY - minY) || 1
  const scale = (SIZE - MARGIN * 2) / span
  const offsetX = MARGIN + ((SIZE - MARGIN * 2) - (maxX - minX) * scale) / 2
  const offsetY = MARGIN + ((SIZE - MARGIN * 2) - (maxY - minY) * scale) / 2
  // SVG's Y axis points down, so the world Y axis is flipped here.
  const screenX = (index: number): number => (projected[index * 3]! - minX) * scale + offsetX
  const screenY = (index: number): number => (maxY - projected[index * 3 + 1]!) * scale + offsetY

  const triangleCount = mesh.triangles.length / 3
  if (triangleCount === 0) return pointCloudSvg(vertexCount, screenX, screenY, accent)

  const stride = sampleStride(triangleCount)
  const faces: { depth: number; shade: number; points: string }[] = []
  for (let face = 0; face < triangleCount; face += stride) {
    const a = mesh.triangles[face * 3]!
    const b = mesh.triangles[face * 3 + 1]!
    const c = mesh.triangles[face * 3 + 2]!
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue

    const ax = screenX(a)
    const ay = screenY(a)
    const bx = screenX(b)
    const by = screenY(b)
    const cx = screenX(c)
    const cy = screenY(c)
    faces.push({
      // Painter's algorithm: nearest faces are emitted last.
      depth: (projected[a * 3 + 2]! + projected[b * 3 + 2]! + projected[c * 3 + 2]!) / 3,
      shade: shadeOf(projected, a, b, c),
      points: `${round(ax)},${round(ay)} ${round(bx)},${round(by)} ${round(cx)},${round(cy)}`,
    })
  }
  if (faces.length === 0) return pointCloudSvg(vertexCount, screenX, screenY, accent)
  faces.sort((left, right) => left.depth - right.depth)

  const [r, g, b] = accentChannels(accent)
  const polygons = faces
    .map((face) => {
      const channel = (value: number): number => Math.round(Math.min(255, value * face.shade))
      const fill = `rgb(${channel(r)},${channel(g)},${channel(b)})`
      return `<polygon points="${face.points}" fill="${fill}"/>`
    })
    .join('')
  return svgDocument(polygons)
}

/** Lambert-style shading from the triangle's screen-space normal. */
function shadeOf(projected: Float64Array, a: number, b: number, c: number): number {
  const ux = projected[b * 3]! - projected[a * 3]!
  const uy = projected[b * 3 + 1]! - projected[a * 3 + 1]!
  const uz = projected[b * 3 + 2]! - projected[a * 3 + 2]!
  const vx = projected[c * 3]! - projected[a * 3]!
  const vy = projected[c * 3 + 1]! - projected[a * 3 + 1]!
  const vz = projected[c * 3 + 2]! - projected[a * 3 + 2]!
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz)
  if (length === 0) return 0.7
  // Light from the upper front-left; both facings are lit so back faces of an
  // open mesh do not turn black.
  const lambert = Math.abs((nx * -0.4 + ny * 0.6 + nz * 0.7) / length)
  return 0.45 + lambert * 0.85
}

function pointCloudSvg(
  vertexCount: number,
  screenX: (index: number) => number,
  screenY: (index: number) => number,
  accent: string,
): string {
  const stride = sampleStride(vertexCount)
  const dots: string[] = []
  for (let index = 0; index < vertexCount; index += stride) {
    dots.push(`<circle cx="${round(screenX(index))}" cy="${round(screenY(index))}" r="1.6"/>`)
  }
  return svgDocument(`<g fill="${accent}" fill-opacity="0.8">${dots.join('')}</g>`)
}

function svgDocument(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" ` +
    `width="${SIZE}" height="${SIZE}" shape-rendering="crispEdges">${body}</svg>`
  )
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function accentChannels(accent: string): [number, number, number] {
  const hex = accent.replace('#', '')
  if (hex.length !== 6) return [69, 137, 255]
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}
