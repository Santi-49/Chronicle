/**
 * Photoshop PSD and PSB: document dimensions plus the JPEG thumbnail Photoshop
 * embeds in the file's image-resources section.
 *
 * Extracting the embedded thumbnail keeps preview generation in the main
 * process with no image dependency and no PSD renderer — and it works for PSB
 * (version 2), which the JavaScript PSD libraries do not support. Layer-level
 * structure extraction stays in the Python AI service, which already does it
 * with psd-tools for annotation.
 *
 * Layout (Adobe file-formats specification):
 *   header      '8BPS'(4) version(2) reserved(6) channels(2) height(4)
 *               width(4) depth(2) colorMode(2)                   = 26 bytes
 *   colour mode length(4) + data
 *   resources   length(4) + a sequence of blocks:
 *               '8BIM'(4) id(2) padded pascal name signedSize(4) data
 *   resource 1036 = thumbnail: format(4) width(4) height(4) widthBytes(4)
 *               totalSize(4) compressedSize(4) bitsPerPixel(2) planes(2)
 *               then JFIF bytes in RGB when format == 1.
 */
import type { FileHandle } from 'node:fs/promises'
import { openBounded, readSlice, type DerivedPreview } from './io'

const HEADER_BYTES = 26
const THUMBNAIL_RESOURCE = 1036
/** Photoshop 4.0 wrote the same structure with BGR channel order. */
const LEGACY_THUMBNAIL_RESOURCE = 1033
const THUMBNAIL_HEADER_BYTES = 28
const JPEG_RGB = 1
/** Photoshop thumbnails are small; anything larger means we misread the file. */
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024
/** Bound the resource walk so a corrupt length cannot spin the loop. */
const MAX_RESOURCE_BLOCKS = 512

interface PhotoshopHeader {
  version: 1 | 2
  width: number
  height: number
}

async function readHeader(file: FileHandle): Promise<PhotoshopHeader | null> {
  const head = await readSlice(file, 0, HEADER_BYTES)
  if (head.length < HEADER_BYTES || head.toString('ascii', 0, 4) !== '8BPS') return null
  const version = head.readUInt16BE(4)
  if (version !== 1 && version !== 2) return null
  return { version, width: head.readUInt32BE(18), height: head.readUInt32BE(14) }
}

/** PSD and PSB share this header, so one reader serves both formats. */
export const readPhotoshopDimensions = openBounded(async (file) => {
  const header = await readHeader(file)
  return header && { width: header.width, height: header.height }
})

/**
 * Return the embedded JPEG thumbnail, or null when the file has none (a
 * document saved without compatibility/preview data). A missing thumbnail is
 * an expected outcome, not an error.
 */
export const readPhotoshopPreview = openBounded<DerivedPreview>(async (file) => {
  if ((await readHeader(file)) === null) return null

  // Skip the colour-mode data section to reach the image resources.
  const colourModeLength = await readUInt32(file, HEADER_BYTES)
  if (colourModeLength === null) return null
  const resourcesStart = HEADER_BYTES + 4 + colourModeLength
  const resourcesLength = await readUInt32(file, resourcesStart)
  if (resourcesLength === null) return null

  const end = resourcesStart + 4 + resourcesLength
  let cursor = resourcesStart + 4
  for (let block = 0; block < MAX_RESOURCE_BLOCKS && cursor + 12 <= end; block++) {
    const prefix = await readSlice(file, cursor, 8)
    if (prefix.length < 8 || prefix.toString('ascii', 0, 4) !== '8BIM') return null
    const resourceId = prefix.readUInt16BE(4)

    // Pascal name: one length byte plus content, padded to an even total.
    const nameLength = prefix[6]!
    const namePadded = nameLength + 1 + ((nameLength + 1) % 2)
    const sizeOffset = cursor + 6 + namePadded
    const dataSize = await readUInt32(file, sizeOffset)
    if (dataSize === null) return null
    const dataStart = sizeOffset + 4

    if (resourceId === THUMBNAIL_RESOURCE || resourceId === LEGACY_THUMBNAIL_RESOURCE) {
      return readThumbnailResource(file, dataStart, dataSize, resourceId)
    }

    // Resource blocks are padded to an even length.
    cursor = dataStart + dataSize + (dataSize % 2)
  }
  return null
})

async function readThumbnailResource(
  file: FileHandle,
  dataStart: number,
  dataSize: number,
  resourceId: number,
): Promise<DerivedPreview | null> {
  if (dataSize <= THUMBNAIL_HEADER_BYTES || dataSize > MAX_THUMBNAIL_BYTES) return null
  const header = await readSlice(file, dataStart, THUMBNAIL_HEADER_BYTES)
  if (header.length < THUMBNAIL_HEADER_BYTES) return null
  // Only the JFIF variant is usable as-is; raw RGB thumbnails are rare and
  // would need channel reordering plus an encoder, so they fall back to none.
  if (header.readUInt32BE(0) !== JPEG_RGB) return null
  // Resource 1033 stores the same JPEG with BGR channels, which would render
  // with swapped colours — never show it as a faithful preview.
  if (resourceId === LEGACY_THUMBNAIL_RESOURCE) return null

  const declared = header.readUInt32BE(20) // compressed size
  const available = dataSize - THUMBNAIL_HEADER_BYTES
  const length = declared > 0 && declared <= available ? declared : available
  const bytes = await readSlice(file, dataStart + THUMBNAIL_HEADER_BYTES, length)
  // Verify it really is JPEG before handing it to the renderer.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  return { bytes, mediaType: 'image/jpeg' }
}

async function readUInt32(file: FileHandle, position: number): Promise<number | null> {
  const slice = await readSlice(file, position, 4)
  return slice.length < 4 ? null : slice.readUInt32BE(0)
}
