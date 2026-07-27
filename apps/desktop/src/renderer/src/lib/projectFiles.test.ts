import { describe, expect, it } from 'vitest'
import { REMOVED_ASSET_RETENTION_DAYS, type AssetSummary, type TrackedFolder } from '../../../shared/ipc'
import { browseFolder, relativeSegments, retentionDaysLeft, totalVersions } from './projectFiles'

const project: TrackedFolder = {
  id: 1,
  path: 'C:\\Designs',
  addedAt: '2026-07-01T00:00:00.000Z',
  displayName: 'Designs',
  description: '',
  icon: 'folder',
  color: '#4589ff',
  excludedPaths: [],
  allowedExtensions: ['.png'],
}

function asset(assetPath: string, capturedAt: string, overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: assetPath.length + capturedAt.length,
    displayName: assetPath.split('\\').pop()!,
    path: assetPath,
    onDisk: true,
    missingSince: null,
    versionCount: 1,
    lastCapturedAt: capturedAt,
    lastSummary: null,
    thumbnailUrl: null,
    format: 'png',
    ...overrides,
  }
}

const assets = [
  asset('C:\\Designs\\hero.png', '2026-07-20T10:00:00.000Z'),
  asset('C:\\Designs\\logo.png', '2026-07-25T10:00:00.000Z'),
  asset('C:\\Designs\\brand\\mark.png', '2026-07-24T10:00:00.000Z'),
  asset('C:\\Designs\\brand\\logos\\wide.png', '2026-07-26T10:00:00.000Z'),
  asset('C:\\Designs\\ads\\banner.png', '2026-07-10T10:00:00.000Z'),
  asset('D:\\Other\\stray.png', '2026-07-26T11:00:00.000Z'),
]

describe('browseFolder', () => {
  it('shows the root level: subfolders first, files newest first', () => {
    const { folders, files } = browseFolder(project, assets)

    expect(folders.map((folder) => folder.name)).toEqual(['ads', 'brand'])
    // A folder counts everything below it, not just its direct children.
    expect(folders.find((folder) => folder.name === 'brand')).toMatchObject({
      assetCount: 2,
      segments: ['brand'],
      lastCapturedAt: '2026-07-26T10:00:00.000Z',
    })
    expect(files.map((file) => file.displayName)).toEqual(['logo.png', 'hero.png'])
  })

  it('descends into a subfolder and keeps deeper folders navigable', () => {
    const level = browseFolder(project, assets, ['brand'])
    expect(level.folders.map((folder) => folder.segments)).toEqual([['brand', 'logos']])
    expect(level.files.map((file) => file.displayName)).toEqual(['mark.png'])

    const deeper = browseFolder(project, assets, ['brand', 'logos'])
    expect(deeper.folders).toEqual([])
    expect(deeper.files.map((file) => file.displayName)).toEqual(['wide.png'])
  })

  it('ignores assets outside the project and folders that no longer match', () => {
    expect(browseFolder(project, assets).files.some((f) => f.path.startsWith('D:'))).toBe(false)
    expect(browseFolder(project, assets, ['gone'])).toEqual({ folders: [], files: [] })
  })

  it('splits a path into segments below the project root', () => {
    expect(relativeSegments(project, assets[3]!)).toEqual(['brand', 'logos', 'wide.png'])
  })

  it('sums versions across a set of assets', () => {
    expect(totalVersions([asset('C:\\Designs\\a.png', '2026-07-01T00:00:00.000Z', { versionCount: 3 })]))
      .toBe(3)
  })
})

describe('retentionDaysLeft', () => {
  const now = Date.parse('2026-07-27T12:00:00.000Z')
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()

  it('counts down whole days from the removal', () => {
    expect(retentionDaysLeft(daysAgo(0), now)).toBe(REMOVED_ASSET_RETENTION_DAYS)
    expect(retentionDaysLeft(daysAgo(1), now)).toBe(REMOVED_ASSET_RETENTION_DAYS - 1)
    // Rounded up, so a part-used final day still reads as one day left.
    expect(retentionDaysLeft(daysAgo(29.5), now)).toBe(1)
  })

  it('never goes negative, and treats unknown dates as a full window', () => {
    expect(retentionDaysLeft(daysAgo(90), now)).toBe(0)
    expect(retentionDaysLeft(null, now)).toBe(REMOVED_ASSET_RETENTION_DAYS)
    expect(retentionDaysLeft('not a date', now)).toBe(REMOVED_ASSET_RETENTION_DAYS)
  })
})
