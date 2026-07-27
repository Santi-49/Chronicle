/**
 * How a project's captured files are organised for display, and how long a
 * removed one is kept.
 *
 * Pure functions over C1 data, deliberately separate from the hooks in
 * useChronicle.ts so they can be unit-tested without the Electron bridge.
 * A "project" in the UI is a tracked folder; an asset belongs to the folder
 * whose path is the longest prefix of the asset's path.
 */
import {
  REMOVED_ASSET_RETENTION_DAYS,
  type AssetSummary,
  type TrackedFolder,
} from '../../../shared/ipc'

function withSep(p: string): string {
  return p.endsWith('\\') || p.endsWith('/') ? p : p + (p.includes('\\') ? '\\' : '/')
}

export function folderContainsAsset(folder: TrackedFolder, asset: AssetSummary): boolean {
  return asset.path === folder.path || asset.path.startsWith(withSep(folder.path))
}

export function assetsForFolder(folder: TrackedFolder, assets: AssetSummary[]): AssetSummary[] {
  return assets.filter((asset) => folderContainsAsset(folder, asset))
}

/** The tracked folder an asset lives under (longest matching path), if any. */
export function folderForAsset(
  asset: AssetSummary | undefined,
  folders: TrackedFolder[],
): TrackedFolder | undefined {
  if (!asset) return undefined
  return folders
    .filter((folder) => folderContainsAsset(folder, asset))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

/** An asset's path split into segments below its project, file name last. */
export function relativeSegments(folder: TrackedFolder, asset: AssetSummary): string[] {
  const prefix = withSep(folder.path)
  const relative = asset.path.startsWith(prefix) ? asset.path.slice(prefix.length) : asset.path
  return relative.split(/[\\/]/).filter((part) => part !== '')
}

/** A subfolder as shown in the project's folder browser. */
export interface BrowsedFolder {
  name: string
  /** Segments from the project root, e.g. ['brand', 'logos']. */
  segments: string[]
  /** Assets directly inside and below this folder. */
  assetCount: number
  /** Most recent capture anywhere below this folder. */
  lastCapturedAt: string | null
}

export interface BrowsedContents {
  folders: BrowsedFolder[]
  files: AssetSummary[]
}

/**
 * One level of a project's folder tree: the subfolders directly inside `at`
 * and the assets that live in it. The tree is derived from the assets given,
 * so it shows exactly what Chronicle has captured. A folder with nothing
 * captured in it has nothing to open.
 */
export function browseFolder(
  folder: TrackedFolder,
  assets: AssetSummary[],
  at: readonly string[] = [],
): BrowsedContents {
  const files: AssetSummary[] = []
  const folders = new Map<string, BrowsedFolder>()

  for (const asset of assetsForFolder(folder, assets)) {
    const segments = relativeSegments(folder, asset)
    if (segments.length <= at.length) continue
    if (!at.every((segment, index) => segments[index] === segment)) continue

    if (segments.length === at.length + 1) {
      files.push(asset)
      continue
    }
    const name = segments[at.length]!
    const existing = folders.get(name)
    if (existing) {
      existing.assetCount += 1
      if (!existing.lastCapturedAt || asset.lastCapturedAt > existing.lastCapturedAt) {
        existing.lastCapturedAt = asset.lastCapturedAt
      }
    } else {
      folders.set(name, {
        name,
        segments: [...at, name],
        assetCount: 1,
        lastCapturedAt: asset.lastCapturedAt,
      })
    }
  }

  return {
    folders: [...folders.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    ),
    files: files.sort((a, b) => b.lastCapturedAt.localeCompare(a.lastCapturedAt)),
  }
}

/** Aggregate version count across a set of assets. */
export function totalVersions(assets: AssetSummary[]): number {
  return assets.reduce((sum, asset) => sum + asset.versionCount, 0)
}

/**
 * Whole days left before a removed file's history is deleted permanently.
 * Rounded up, so "1 day left" means the last day rather than an expired entry.
 */
export function retentionDaysLeft(missingSince: string | null, now = Date.now()): number {
  if (!missingSince) return REMOVED_ASSET_RETENTION_DAYS
  const since = new Date(missingSince).getTime()
  if (Number.isNaN(since)) return REMOVED_ASSET_RETENTION_DAYS
  const elapsedDays = (now - since) / (24 * 60 * 60 * 1000)
  return Math.max(0, Math.ceil(REMOVED_ASSET_RETENTION_DAYS - elapsedDays))
}
