/**
 * The creative-file format registry — one source of truth for every format
 * Chronicle can capture, and for how each one is previewed and displayed.
 *
 * Imported by main, preload, and the renderer, so this module stays free of
 * Node built-ins and of any byte-level parsing: it is pure data plus string
 * helpers. Format-specific *behavior* (metadata readers, preview generators)
 * lives in `src/main/formats/`, keyed by the `id` values declared here.
 *
 * Adding a format:
 *   1. add one entry below,
 *   2. register its metadata reader / preview generator in `src/main/formats/`,
 *   3. add its prompt section + adapter in the AI service when annotation is
 *      implemented (until then `aiFormat: null` keeps its jobs queued).
 * Nothing else in the app should ever branch on a file extension.
 */

export type FormatId = 'png' | 'jpg' | 'svg' | 'psd' | 'psb' | 'obj' | 'step' | 'blend'

/** How the renderer obtains something to show for a version. */
export type PreviewStrategy =
  /** Chromium decodes the stored bytes directly (PNG/JPG/SVG). */
  | 'native'
  /** Main derives a displayable image from the stored bytes and caches it. */
  | 'derived'
  /** No still image is available; lists show the format placeholder. */
  | 'none'

/** Which renderer component shows a version's visual. */
export type ViewerKind =
  /** A bitmap in an <img> element. */
  | 'raster'
  /** Vector markup in an <img> element (never inlined — see media.ts). */
  | 'svg'
  /** Interactive 3D mesh view. */
  | 'mesh3d'

export interface FormatDescriptor {
  id: FormatId
  /** User-facing name, used by the project file-type toggles. */
  label: string
  /** Lowercase, dot-prefixed extensions. The first one is the canonical form. */
  extensions: readonly string[]
  /** Content type used when serving the original bytes to the renderer. */
  mediaType: string
  preview: PreviewStrategy
  viewer: ViewerKind
  /**
   * Icon name (see renderer `Icon.tsx`) shown when no preview image exists.
   * Declared here so the renderer never maps file types itself.
   */
  icon: 'image' | 'layers' | 'cube' | 'architecture' | 'shapes'
  /**
   * The C3 `format` value to send with an annotation request, or null while the
   * AI service has no adapter for this format. Null keeps captured versions'
   * annotation jobs queued instead of failing them (spec F4, POST-02).
   */
  aiFormat: string | null
  /** Per-format capture ceiling; falls back to the global cap when absent. */
  maxBytes?: number
}

/**
 * Declared in the roadmap order from docs/challenge/RESEARCH.md. PNG and JPG
 * are the MVP baseline; the rest are captured and displayed by the desktop app
 * while their AI annotation is still pending implementation.
 */
export const FORMATS: readonly FormatDescriptor[] = [
  {
    id: 'png',
    label: 'PNG',
    extensions: ['.png'],
    mediaType: 'image/png',
    preview: 'native',
    viewer: 'raster',
    icon: 'image',
    aiFormat: 'png',
  },
  {
    id: 'jpg',
    label: 'JPG / JPEG',
    extensions: ['.jpg', '.jpeg'],
    mediaType: 'image/jpeg',
    preview: 'native',
    viewer: 'raster',
    icon: 'image',
    aiFormat: 'jpg',
  },
  {
    id: 'svg',
    label: 'SVG',
    extensions: ['.svg'],
    mediaType: 'image/svg+xml',
    preview: 'native',
    viewer: 'svg',
    icon: 'shapes',
    aiFormat: null,
  },
  {
    id: 'psd',
    label: 'Photoshop PSD',
    extensions: ['.psd'],
    mediaType: 'image/vnd.adobe.photoshop',
    preview: 'derived',
    viewer: 'raster',
    icon: 'layers',
    aiFormat: 'psd',
  },
  {
    id: 'psb',
    label: 'Photoshop PSB',
    extensions: ['.psb'],
    mediaType: 'image/vnd.adobe.photoshop',
    preview: 'derived',
    viewer: 'raster',
    icon: 'layers',
    aiFormat: null,
  },
  {
    id: 'obj',
    label: 'OBJ 3D model',
    extensions: ['.obj'],
    mediaType: 'model/obj',
    preview: 'derived',
    viewer: 'mesh3d',
    icon: 'cube',
    aiFormat: null,
  },
  {
    // STEP needs a CAD kernel to tessellate, which runs in the renderer's
    // 3D viewer rather than in main, so there is no still thumbnail.
    id: 'step',
    label: 'STEP CAD',
    extensions: ['.step', '.stp'],
    mediaType: 'model/step',
    preview: 'none',
    viewer: 'mesh3d',
    icon: 'architecture',
    aiFormat: null,
  },
  {
    id: 'blend',
    label: 'Blender BLEND',
    extensions: ['.blend'],
    mediaType: 'application/x-blender',
    preview: 'derived',
    viewer: 'raster',
    icon: 'cube',
    aiFormat: null,
  },
]

const BY_ID = new Map(FORMATS.map((format) => [format.id, format]))
const BY_EXTENSION = new Map(
  FORMATS.flatMap((format) => format.extensions.map((extension) => [extension, format] as const)),
)

/** Every capturable extension, lowercase and dot-prefixed (C4 source data). */
export const SUPPORTED_EXTENSIONS: readonly string[] = [...BY_EXTENSION.keys()]

/** Lowercase, dot-prefixed extension of a path, or '' when it has none. */
export function extensionOf(filePath: string): string {
  const base = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

/** The descriptor for a path's extension, or null when it is not supported. */
export function formatForPath(filePath: string): FormatDescriptor | null {
  return BY_EXTENSION.get(extensionOf(filePath)) ?? null
}

/** The descriptor for a known id. Throws for an unknown id (a programming error). */
export function formatById(id: FormatId): FormatDescriptor {
  const format = BY_ID.get(id)
  if (!format) throw new Error(`Unknown format id: ${id}`)
  return format
}

/** Narrowing guard for values arriving from IPC, URLs, or persisted rows. */
export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && BY_ID.has(value as FormatId)
}

/**
 * True when the AI service accepts this format today. False means capture,
 * preview, timeline, restore, and keyword search all work while the version's
 * annotation job waits in the queue for POST-02 support.
 */
export function supportsAnnotation(format: FormatDescriptor): boolean {
  return format.aiFormat !== null
}
