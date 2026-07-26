/**
 * Wavefront OBJ: parse geometry and render a still thumbnail.
 *
 * OBJ is plain text, so parsing needs no dependency. Reading is bounded in
 * both bytes and element count: preview generation runs in the main process and
 * must never stall IPC on a large model. A bounded read yields a partial but
 * recognisable preview; the interactive viewer loads the full file in the
 * renderer instead.
 *
 * Material libraries (`mtllib`) are intentionally ignored — the thumbnail is a
 * neutral shaded form, and following external references would mean reading
 * files outside the content-addressed library.
 */
import fs from 'node:fs'
import readline from 'node:readline'
import { EMPTY_MESH, meshToSvg, type Mesh } from './mesh'
import type { DerivedPreview } from './io'

const MAX_BYTES = 16 * 1024 * 1024
const MAX_VERTICES = 400_000
const MAX_TRIANGLES = 400_000

/** Destroy a read stream and resolve once its file descriptor is really closed. */
async function closeStream(stream: fs.ReadStream | undefined): Promise<void> {
  if (!stream || stream.closed) return
  await new Promise<void>((resolve) => {
    stream.once('close', resolve)
    stream.destroy()
  })
}

/**
 * Read vertices and triangulated faces. Never throws: an unreadable or
 * non-OBJ file yields an empty mesh, which the caller renders as "no preview".
 */
export async function parseObj(filePath: string): Promise<Mesh> {
  const vertices: number[] = []
  const triangles: number[] = []
  let truncated = false
  let bytesRead = 0

  let stream: fs.ReadStream | undefined
  try {
    stream = fs.createReadStream(filePath, { encoding: 'utf8' })
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
    for await (const line of lines) {
      bytesRead += line.length + 1
      if (
        bytesRead > MAX_BYTES ||
        vertices.length / 3 >= MAX_VERTICES ||
        triangles.length / 3 >= MAX_TRIANGLES
      ) {
        truncated = true
        break
      }
      // Only geometry matters here; every other statement is skipped cheaply.
      if (line.charCodeAt(0) === 118 /* v */ && line[1] === ' ') {
        readVertex(line, vertices)
      } else if (line.charCodeAt(0) === 102 /* f */ && line[1] === ' ') {
        readFace(line, vertices.length / 3, triangles)
      }
    }
    lines.close()
  } catch {
    return EMPTY_MESH
  } finally {
    // Wait for the handle to actually close, not just for destroy() to be
    // requested: on Windows an open handle blocks deleting or replacing the
    // file, which would surface as Chronicle locking a designer's own save.
    await closeStream(stream)
  }

  return {
    vertices: Float64Array.from(vertices),
    triangles: Uint32Array.from(triangles),
    truncated,
  }
}

function readVertex(line: string, vertices: number[]): void {
  const parts = line.split(/\s+/)
  const x = Number(parts[1])
  const y = Number(parts[2])
  const z = Number(parts[3])
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
    vertices.push(x, y, z)
  }
}

/**
 * Faces may be polygons and may reference vertices as `v`, `v/vt`, `v//vn` or
 * `v/vt/vn`, with 1-based or negative (relative) indices. Polygons are fanned
 * into triangles, which is correct for the convex faces OBJ exporters emit.
 */
function readFace(line: string, vertexCount: number, triangles: number[]): void {
  const parts = line.split(/\s+/)
  const corners: number[] = []
  for (let index = 1; index < parts.length; index++) {
    const token = parts[index]!
    if (token === '') continue
    const raw = Number.parseInt(token.split('/')[0]!, 10)
    if (!Number.isInteger(raw) || raw === 0) return
    const resolved = raw > 0 ? raw - 1 : vertexCount + raw
    if (resolved < 0 || resolved >= vertexCount) return
    corners.push(resolved)
  }
  for (let corner = 2; corner < corners.length; corner++) {
    triangles.push(corners[0]!, corners[corner - 1]!, corners[corner]!)
  }
}

/** Flat-shaded SVG thumbnail, or null when the file holds no usable geometry. */
export async function readObjPreview(filePath: string): Promise<DerivedPreview | null> {
  const svg = meshToSvg(await parseObj(filePath))
  return svg === null ? null : { bytes: Buffer.from(svg, 'utf8'), mediaType: 'image/svg+xml' }
}
