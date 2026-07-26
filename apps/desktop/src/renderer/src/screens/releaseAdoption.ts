import type { AdminCategoryCount } from '../../../shared/ipc'

export interface ReleaseAdoption {
  latestVersion: string | null
  latestCount: number
  outdatedCount: number
  total: number
}

function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function releaseAdoption(
  values: AdminCategoryCount[],
  targetVersion?: string,
): ReleaseAdoption {
  const valid = values
    .map((item) => ({ ...item, parts: versionParts(item.label) }))
    .filter((item): item is AdminCategoryCount & { parts: number[] } => item.parts !== null)
    .sort((a, b) => {
      for (let index = 0; index < 3; index++) {
        const difference = b.parts[index]! - a.parts[index]!
        if (difference) return difference
      }
      return 0
    })
  const targetParts = targetVersion ? versionParts(targetVersion) : null
  const latestVersion = targetParts ? targetVersion! : valid[0]?.label ?? null
  const total = values.reduce((sum, item) => sum + item.count, 0)
  const latestCount = latestVersion === null
    ? 0
    : targetParts
      ? valid.filter((item) => {
        for (let index = 0; index < 3; index++) {
          if (item.parts[index]! > targetParts[index]!) return true
          if (item.parts[index]! < targetParts[index]!) return false
        }
        return true
      }).reduce((sum, item) => sum + item.count, 0)
      : values.filter((item) => item.label === latestVersion)
        .reduce((sum, item) => sum + item.count, 0)
  return { latestVersion, latestCount, outdatedCount: Math.max(0, total - latestCount), total }
}
