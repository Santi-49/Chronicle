import { AssetPreview } from './AssetPreview'
import { MeshViewer } from './MeshViewer'
import { formatById } from '../../../shared/formats'
import type { VersionDetails } from '../../../shared/ipc'

/**
 * The full-size visual on the version details screen, chosen by the format's
 * declared viewer kind (see `shared/formats.ts`):
 *
 *   raster / svg → the still image, natively decoded or derived by main
 *   mesh3d       → an interactive 3D view of the stored geometry
 *
 * Adding a format never changes this component: it changes one registry entry.
 */
export function VersionVisual({ version }: { version: VersionDetails }) {
  const label = `Version ${version.versionNumber}`
  const descriptor = version.format ? formatById(version.format) : null

  if (descriptor?.viewer === 'mesh3d' && version.imageUrl) {
    return <MeshViewer format={descriptor.id} label={label} src={version.imageUrl} />
  }
  return <AssetPreview alt={label} format={version.format} src={version.thumbnailUrl} />
}
