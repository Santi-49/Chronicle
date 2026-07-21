import type { CSSProperties } from 'react'
import archiveIcon from '@material-symbols/svg-400/outlined/inventory_2.svg'
import arrowLeftIcon from '@material-symbols/svg-400/outlined/arrow_back.svg'
import arrowDownIcon from '@material-symbols/svg-400/outlined/arrow_downward.svg'
import arrowUpIcon from '@material-symbols/svg-400/outlined/arrow_upward.svg'
import brushIcon from '@material-symbols/svg-400/outlined/brush.svg'
import cameraIcon from '@material-symbols/svg-400/outlined/photo_camera.svg'
import campaignIcon from '@material-symbols/svg-400/outlined/campaign.svg'
import categoryIcon from '@material-symbols/svg-400/outlined/category.svg'
import checkIcon from '@material-symbols/svg-400/outlined/check.svg'
import chevronRightIcon from '@material-symbols/svg-400/outlined/chevron_right.svg'
import closeIcon from '@material-symbols/svg-400/outlined/close.svg'
import clockIcon from '@material-symbols/svg-400/outlined/history.svg'
import editIcon from '@material-symbols/svg-400/outlined/edit.svg'
import folderPlusIcon from '@material-symbols/svg-400/outlined/create_new_folder.svg'
import folderIcon from '@material-symbols/svg-400/outlined/folder.svg'
import homeIcon from '@material-symbols/svg-400/outlined/home.svg'
import imageIcon from '@material-symbols/svg-400/outlined/image.svg'
import infoIcon from '@material-symbols/svg-400/outlined/info.svg'
import keyIcon from '@material-symbols/svg-400/outlined/key.svg'
import refreshIcon from '@material-symbols/svg-400/outlined/refresh.svg'
import restoreIcon from '@material-symbols/svg-400/outlined/settings_backup_restore.svg'
import searchIcon from '@material-symbols/svg-400/outlined/search.svg'
import settingsIcon from '@material-symbols/svg-400/outlined/settings.svg'
import paletteIcon from '@material-symbols/svg-400/outlined/palette.svg'
import sparkIcon from '@material-symbols/svg-400/outlined/wand_stars.svg'
import themeDarkIcon from '@material-symbols/svg-400/outlined/dark_mode.svg'
import themeLightIcon from '@material-symbols/svg-400/outlined/light_mode.svg'

export type IconName =
  | 'archive'
  | 'arrow-left'
  | 'arrow-down'
  | 'arrow-up'
  | 'brush'
  | 'camera'
  | 'campaign'
  | 'category'
  | 'check'
  | 'chevron-right'
  | 'clock'
  | 'close'
  | 'edit'
  | 'folder-plus'
  | 'folder'
  | 'home'
  | 'image'
  | 'info'
  | 'key'
  | 'refresh'
  | 'restore'
  | 'search'
  | 'settings'
  | 'palette'
  | 'spark'
  | 'theme-dark'
  | 'theme-light'

const icons: Record<IconName, string> = {
  archive: archiveIcon,
  'arrow-left': arrowLeftIcon,
  'arrow-down': arrowDownIcon,
  'arrow-up': arrowUpIcon,
  brush: brushIcon,
  camera: cameraIcon,
  campaign: campaignIcon,
  category: categoryIcon,
  check: checkIcon,
  'chevron-right': chevronRightIcon,
  clock: clockIcon,
  close: closeIcon,
  edit: editIcon,
  'folder-plus': folderPlusIcon,
  folder: folderIcon,
  home: homeIcon,
  image: imageIcon,
  info: infoIcon,
  key: keyIcon,
  refresh: refreshIcon,
  restore: restoreIcon,
  search: searchIcon,
  settings: settingsIcon,
  palette: paletteIcon,
  spark: sparkIcon,
  'theme-dark': themeDarkIcon,
  'theme-light': themeLightIcon
}

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const style = { '--icon-url': `url("${icons[name]}")` } as CSSProperties

  return <span aria-hidden="true" className={`icon ${className}`} style={style} />
}
