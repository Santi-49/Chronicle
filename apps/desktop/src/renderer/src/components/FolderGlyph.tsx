import { Icon, type IconName } from './Icon'

/** Icon names offered when creating a project. */
export const FOLDER_ICONS: IconName[] = [
  'folder',
  'campaign',
  'brush',
  'camera',
  'image',
  'category',
  'archive',
]

/** Accent colors offered when creating a project (IBM palette). */
export const FOLDER_COLORS = ['#4589ff', '#08bdba', '#a56eff', '#ee5396', '#ff832b', '#42be65']

function isIconName(value: string): value is IconName {
  return (FOLDER_ICONS as string[]).includes(value)
}

/**
 * Renders a tracked folder's icon: a bundled Material Symbol when `icon` is a
 * known name, otherwise the raw glyph (a custom emoji/letter the user typed).
 */
export function FolderGlyph({
  icon,
  color,
  className = '',
}: {
  icon: string
  color: string
  className?: string
}) {
  return (
    <span className={`project-folder ${className}`} style={{ color }}>
      {isIconName(icon) ? <Icon name={icon} /> : <span className="custom-icon-glyph">{icon}</span>}
    </span>
  )
}
