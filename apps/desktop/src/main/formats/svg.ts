/**
 * SVG metadata. The renderer displays SVG natively, so only the declared
 * document size is needed here.
 *
 * Read from the root element's `width`/`height`, falling back to `viewBox`
 * when they are missing or relative (a percentage). Only the head of the file
 * is read — the root element is always at the top.
 */
import { openBounded, readSlice } from './io'

const HEAD_BYTES = 8 * 1024

/** Absolute CSS lengths, converted to pixels at the CSS 96 dpi reference. */
const UNIT_SCALE: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
}

function parseLength(value: string | undefined): number | null {
  if (value === undefined) return null
  const match = /^\s*([+-]?[\d.]+)\s*([a-z%]*)\s*$/i.exec(value)
  if (!match) return null
  const scale = UNIT_SCALE[match[2]!.toLowerCase()]
  if (scale === undefined) return null // '%' and unknown units are not absolute
  const pixels = Number(match[1]) * scale
  return Number.isFinite(pixels) && pixels > 0 ? Math.round(pixels) : null
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return match?.[2] ?? match?.[3]
}

export const readSvgDimensions = openBounded(async (file) => {
  const head = (await readSlice(file, 0, HEAD_BYTES)).toString('utf8')
  const root = /<svg\b[^>]*>/i.exec(head)
  if (!root) return null
  const tag = root[0]

  const width = parseLength(attribute(tag, 'width'))
  const height = parseLength(attribute(tag, 'height'))
  if (width !== null && height !== null) return { width, height }

  const viewBox = attribute(tag, 'viewBox')?.trim().split(/[\s,]+/)
  if (viewBox?.length === 4) {
    const boxWidth = Math.round(Number(viewBox[2]))
    const boxHeight = Math.round(Number(viewBox[3]))
    if (boxWidth > 0 && boxHeight > 0) {
      return { width: width ?? boxWidth, height: height ?? boxHeight }
    }
  }
  return null
})
