import type { IconName } from '../components/Icon'

export type PreviewVariant = 'campaign' | 'editorial' | 'packaging' | 'poster'
export type AiStatus = 'done' | 'pending' | 'failed'

export interface Version {
  id: string
  number: number
  createdAt: string
  summary: string
  changes: string[]
  tags: string[]
  size: string
  dimensions: string
  hash: string
  aiStatus: AiStatus
}

export interface Asset {
  id: string
  name: string
  path: string
  updatedAt: string
  summary: string
  variant: PreviewVariant
  versions: Version[]
}

export interface Project {
  id: string
  name: string
  path: string
  updatedAt: string
  icon: IconName
  color: string
  assetIds: string[]
}

/** Icon choices offered when creating a project. */
export const projectIcons: IconName[] = ['folder', 'campaign', 'brush', 'camera', 'image', 'category', 'archive']

/** Color choices offered when creating a project (IBM palette accents). */
export const projectColors = ['#4589ff', '#08bdba', '#a56eff', '#ee5396', '#ff832b', '#42be65']

export const assets: Asset[] = [
  {
    id: 'aurora-campaign',
    name: 'aurora-campaign.jpg',
    path: 'D:\\Creative\\Aurora\\aurora-campaign.jpg',
    updatedAt: '12 minutes ago',
    summary: 'Headline moved left and the background changed from navy to cobalt.',
    variant: 'campaign',
    versions: [
      {
        id: 'aurora-v8',
        number: 8,
        createdAt: 'Today, 14:32',
        summary: 'Headline moved left and the background changed from navy to cobalt.',
        changes: [
          'Background color changed from deep navy to cobalt blue.',
          'Main headline moved to the left third of the composition.',
          'Call-to-action copy changed from “Discover” to “Explore the collection”.'
        ],
        tags: ['campaign', 'blue', 'typography', 'launch'],
        size: '3.8 MB',
        dimensions: '2400 × 1600',
        hash: '8f4a2d1c…91be',
        aiStatus: 'done'
      },
      {
        id: 'aurora-v7',
        number: 7,
        createdAt: 'Today, 13:18',
        summary: 'Product image enlarged and supporting copy shortened.',
        changes: ['Product image scaled up by roughly 15%.', 'Two lines of supporting copy were removed.'],
        tags: ['campaign', 'product', 'layout'],
        size: '3.6 MB',
        dimensions: '2400 × 1600',
        hash: '9c330aaf…2e18',
        aiStatus: 'done'
      },
      {
        id: 'aurora-v6',
        number: 6,
        createdAt: 'Yesterday, 18:06',
        summary: 'A warmer product crop replaced the previous studio image.',
        changes: ['Hero image replaced.', 'Shadow beneath the product softened.'],
        tags: ['campaign', 'photography'],
        size: '3.5 MB',
        dimensions: '2400 × 1600',
        hash: 'a104fd23…44d0',
        aiStatus: 'done'
      },
      {
        id: 'aurora-v5',
        number: 5,
        createdAt: 'Yesterday, 16:44',
        summary: 'Waiting for an AI change summary.',
        changes: [],
        tags: [],
        size: '3.2 MB',
        dimensions: '2400 × 1600',
        hash: '650ece98…43c1',
        aiStatus: 'pending'
      },
      {
        id: 'aurora-v4',
        number: 4,
        createdAt: '15 Jul, 11:20',
        summary: 'The AI summary could not be generated. The version is stored safely.',
        changes: [],
        tags: [],
        size: '3.1 MB',
        dimensions: '2400 × 1600',
        hash: 'c0526bb2…90ed',
        aiStatus: 'failed'
      }
    ]
  },
  {
    id: 'field-notes',
    name: 'field-notes-cover.png',
    path: 'D:\\Creative\\Aurora\\Editorial\\field-notes-cover.png',
    updatedAt: 'Yesterday',
    summary: 'Issue number added above the masthead and image contrast reduced.',
    variant: 'editorial',
    versions: [
      {
        id: 'field-v4',
        number: 4,
        createdAt: 'Yesterday, 16:10',
        summary: 'Issue number added above the masthead and image contrast reduced.',
        changes: ['Issue 08 label added.', 'Background photo contrast reduced.'],
        tags: ['editorial', 'cover', 'monochrome'],
        size: '5.1 MB',
        dimensions: '1800 × 2400',
        hash: '32a79e88…4dc3',
        aiStatus: 'done'
      }
    ]
  },
  {
    id: 'north-packaging',
    name: 'north-coffee-packaging.jpg',
    path: 'D:\\Creative\\North Coffee\\north-coffee-packaging.jpg',
    updatedAt: '14 Jul 2026',
    summary: 'Roast label changed to “Dark” and the origin line was repositioned.',
    variant: 'packaging',
    versions: [
      {
        id: 'north-v6',
        number: 6,
        createdAt: '14 Jul, 09:42',
        summary: 'Roast label changed to “Dark” and the origin line was repositioned.',
        changes: ['Roast strength label updated.', 'Origin copy aligned with the lower grid.'],
        tags: ['packaging', 'coffee', 'label'],
        size: '4.4 MB',
        dimensions: '2200 × 2200',
        hash: 'bb9b4102…a2f7',
        aiStatus: 'done'
      }
    ]
  },
  {
    id: 'kinetic-poster',
    name: 'kinetic-type-poster.png',
    path: 'D:\\Creative\\Kinetic Type\\kinetic-type-poster.png',
    updatedAt: '11 Jul 2026',
    summary: 'Secondary type rotated and the event date moved beneath the title.',
    variant: 'poster',
    versions: [
      {
        id: 'kinetic-v3',
        number: 3,
        createdAt: '11 Jul, 19:05',
        summary: 'Secondary type rotated and the event date moved beneath the title.',
        changes: ['Secondary type rotated 90 degrees.', 'Event date moved beneath title.'],
        tags: ['poster', 'typography', 'orange'],
        size: '2.9 MB',
        dimensions: '1800 × 2400',
        hash: '1a90c0fd…e194',
        aiStatus: 'done'
      }
    ]
  }
]

export const projects: Project[] = [
  {
    id: 'aurora-launch',
    name: 'Aurora launch',
    path: 'D:\\Creative\\Aurora',
    updatedAt: '12 minutes ago',
    icon: 'campaign',
    color: '#4589ff',
    assetIds: ['aurora-campaign', 'field-notes']
  },
  {
    id: 'north-coffee',
    name: 'North Coffee',
    path: 'D:\\Creative\\North Coffee',
    updatedAt: '14 Jul 2026',
    icon: 'category',
    color: '#ff832b',
    assetIds: ['north-packaging']
  },
  {
    id: 'kinetic-type',
    name: 'Kinetic Type',
    path: 'D:\\Creative\\Kinetic Type',
    updatedAt: '11 Jul 2026',
    icon: 'brush',
    color: '#a56eff',
    assetIds: ['kinetic-poster']
  }
]

export function getProject(projectId: string): Project {
  return projects.find((project) => project.id === projectId) ?? projects[0]
}

export function getProjectAssets(projectId: string): Asset[] {
  const project = getProject(projectId)
  return project.assetIds.map((assetId) => getAsset(assetId))
}

export interface ProjectFolder {
  /** Immediate subfolder name, or null for files directly in the project root. */
  name: string | null
  assets: Asset[]
}

/** Groups a project's assets by their immediate subfolder (root files first). */
export function getProjectFolders(projectId: string): ProjectFolder[] {
  const project = getProject(projectId)
  const groups = new Map<string | null, Asset[]>()
  for (const asset of getProjectAssets(projectId)) {
    const relative = asset.path.startsWith(project.path) ? asset.path.slice(project.path.length + 1) : asset.path
    const parts = relative.split('\\')
    const folder = parts.length > 1 ? parts[0] : null
    groups.set(folder, [...(groups.get(folder) ?? []), asset])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
    .map(([name, folderAssets]) => ({ name, assets: folderAssets }))
}

export function getProjectForAsset(assetId: string): Project {
  return projects.find((project) => project.assetIds.includes(assetId)) ?? projects[0]
}

export function getAsset(assetId: string): Asset {
  return assets.find((asset) => asset.id === assetId) ?? assets[0]
}

export function getVersion(assetId: string, versionId: string): Version {
  const asset = getAsset(assetId)
  return asset.versions.find((version) => version.id === versionId) ?? asset.versions[0]
}
