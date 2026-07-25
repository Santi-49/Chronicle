/**
 * Per-format behavior, keyed by the ids declared in `src/shared/formats.ts`.
 *
 * This is the only place in the main process that maps a format to code. A new
 * format adds one registry entry here (plus its handler module) — nothing else
 * branches on a file type.
 *
 * Handlers operate on the immutable library copy of a version's bytes, which
 * carries no file extension, so the format id is always passed explicitly.
 */
import type { FormatId } from '../../shared/formats'
import { readBlendPreview } from './blend'
import { readObjPreview } from './obj'
import { readPhotoshopDimensions, readPhotoshopPreview } from './photoshop'
import { readJpegDimensions, readPngDimensions } from './raster'
import { readSvgDimensions } from './svg'
import type { DerivedPreview, FormatDimensions } from './io'

export type { DerivedPreview, FormatDimensions } from './io'

export interface FormatHandler {
  /** Pixel dimensions for version metadata (F3.5); null when not applicable. */
  readDimensions?: (filePath: string) => Promise<FormatDimensions | null>
  /**
   * Build a displayable image for formats Chromium cannot decode. Returning
   * null is an expected outcome (no embedded preview, no geometry) and results
   * in the format placeholder rather than an error.
   */
  createPreview?: (filePath: string) => Promise<DerivedPreview | null>
}

const HANDLERS: Record<FormatId, FormatHandler> = {
  png: { readDimensions: readPngDimensions },
  jpg: { readDimensions: readJpegDimensions },
  svg: { readDimensions: readSvgDimensions },
  psd: { readDimensions: readPhotoshopDimensions, createPreview: readPhotoshopPreview },
  psb: { readDimensions: readPhotoshopDimensions, createPreview: readPhotoshopPreview },
  obj: { createPreview: readObjPreview },
  step: {},
  blend: { createPreview: readBlendPreview },
}

export function handlerFor(format: FormatId): FormatHandler {
  return HANDLERS[format]
}

/** Version metadata for stored bytes of a known format. Never throws. */
export async function readFormatDimensions(
  filePath: string,
  format: FormatId,
): Promise<FormatDimensions | null> {
  const read = handlerFor(format).readDimensions
  return read ? read(filePath) : null
}

/** Derived preview for stored bytes of a known format. Never throws. */
export async function createFormatPreview(
  filePath: string,
  format: FormatId,
): Promise<DerivedPreview | null> {
  const create = handlerFor(format).createPreview
  return create ? create(filePath) : null
}
