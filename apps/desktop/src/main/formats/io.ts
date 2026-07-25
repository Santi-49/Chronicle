/**
 * Shared plumbing for format handlers: safe file access and the two result
 * shapes they produce.
 *
 * Every handler runs on stored library bytes, which may be arbitrary content —
 * a handler must therefore never throw and never allocate from a size it read
 * out of the file without bounding it first.
 */
import fs from 'node:fs'
import type { FileHandle } from 'node:fs/promises'

export interface FormatDimensions {
  width: number
  height: number
}

/** A displayable image derived from a format Chromium cannot decode itself. */
export interface DerivedPreview {
  bytes: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/svg+xml'
}

/**
 * Wrap a reader so it always gets an open handle, always closes it, and turns
 * any failure into `null`. Handlers stay free of try/finally noise.
 */
export function openBounded<T>(
  read: (file: FileHandle) => Promise<T | null>,
): (filePath: string) => Promise<T | null> {
  return async (filePath: string) => {
    let file: FileHandle | undefined
    try {
      file = await fs.promises.open(filePath, 'r')
      return await read(file)
    } catch {
      return null
    } finally {
      await file?.close()
    }
  }
}

/** Read at most `length` bytes from `position`; the result may be shorter. */
export async function readSlice(
  file: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}
