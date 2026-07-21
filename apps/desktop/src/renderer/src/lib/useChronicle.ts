/**
 * React hooks over the C1 bridge (src/shared/ipc.ts).
 *
 * Every hook loads through `window.chronicle` and refreshes itself from the
 * relevant push events, so the UI stays live as captures and AI results land
 * without any polling. AI/network calls are never awaited by the UI — slow
 * work returns immediately and completion arrives as an event (spec §6.5).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppStatus,
  AssetSummary,
  ChronicleEventName,
  ChronicleEvents,
  SearchResult,
  TrackedFolder,
  VersionDetails,
  VersionSummary,
} from '../../../shared/ipc'
import type { AppSettings } from '../../../shared/settings'
import { chronicle } from './bridge'

// ── Primitives ──────────────────────────────────────────────────────────

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
}

/** Loads `loader()` on mount and whenever `deps` change; exposes a manual reload. */
function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loader()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, reload }
}

/** Subscribes to a C1 push event for the lifetime of the component. */
export function useChronicleEvent<E extends ChronicleEventName>(
  event: E,
  handler: (payload: ChronicleEvents[E]) => void,
): void {
  useEffect(() => {
    return chronicle.on(event, handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, handler])
}

// ── Status bar ────────────────────────────────────────────────────────────

export function useAppStatus(): AppStatus | undefined {
  const [status, setStatus] = useState<AppStatus>()
  useEffect(() => {
    void chronicle.getAppStatus().then(setStatus)
    return chronicle.on('statusChanged', setStatus)
  }, [])
  return status
}

// ── Tracked folders (projects) ──────────────────────────────────────────

export interface FoldersApi extends AsyncState<TrackedFolder[]> {
  folders: TrackedFolder[]
}

export function useFolders(): FoldersApi {
  const state = useAsyncData<TrackedFolder[]>(() => chronicle.listFolders(), [])
  return { ...state, folders: state.data ?? [] }
}

// ── Assets ────────────────────────────────────────────────────────────────

export function useAssets(): AsyncState<AssetSummary[]> & { assets: AssetSummary[] } {
  const state = useAsyncData<AssetSummary[]>(() => chronicle.listAssets(), [])
  // New captures and finished annotations both change the assets list.
  useChronicleEvent('versionCaptured', state.reload)
  useChronicleEvent('annotationUpdated', state.reload)
  return { ...state, assets: state.data ?? [] }
}

// ── Timeline ────────────────────────────────────────────────────────────

export function useTimeline(assetId: number): AsyncState<VersionSummary[]> & { versions: VersionSummary[] } {
  const state = useAsyncData<VersionSummary[]>(() => chronicle.getTimeline(assetId), [assetId])
  const { reload } = state
  const onVersion = useCallback(
    (payload: ChronicleEvents['versionCaptured']) => {
      if (payload.assetId === assetId) reload()
    },
    [assetId, reload],
  )
  useChronicleEvent('versionCaptured', onVersion)
  useChronicleEvent('annotationUpdated', state.reload)
  return { ...state, versions: state.data ?? [] }
}

// ── Version details ───────────────────────────────────────────────────────

export function useVersionDetails(versionId: number): AsyncState<VersionDetails> {
  const state = useAsyncData<VersionDetails>(() => chronicle.getVersionDetails(versionId), [versionId])
  const { reload } = state
  const onAnnotation = useCallback(
    (payload: ChronicleEvents['annotationUpdated']) => {
      if (payload.versionId === versionId) reload()
    },
    [versionId, reload],
  )
  useChronicleEvent('annotationUpdated', onAnnotation)
  return state
}

// ── Settings + secret ─────────────────────────────────────────────────────

export interface SettingsApi {
  settings: AppSettings | undefined
  /** Provider ids with a saved key (BYOK). */
  configuredProviders: string[]
  loading: boolean
  save: (patch: Partial<AppSettings>) => Promise<void>
  setApiKey: (provider: string, key: string) => Promise<void>
  clearApiKey: (provider: string) => Promise<void>
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<AppSettings>()
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void Promise.all([chronicle.getSettings(), chronicle.configuredProviders()]).then(
      ([s, providers]) => {
        if (cancelled) return
        setSettings(s)
        setConfiguredProviders(providers)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await chronicle.updateSettings(patch)
    setSettings(next)
  }, [])

  const setApiKey = useCallback(async (provider: string, key: string) => {
    await chronicle.setApiKey(provider, key)
    setConfiguredProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]))
  }, [])

  const clearApiKey = useCallback(async (provider: string) => {
    await chronicle.clearApiKey(provider)
    setConfiguredProviders((prev) => prev.filter((p) => p !== provider))
  }, [])

  return { settings, configuredProviders, loading, save, setApiKey, clearApiKey }
}

// ── Search ────────────────────────────────────────────────────────────────

export interface SearchState {
  results: SearchResult[]
  loading: boolean
  /** Set when the search backend is not available yet (MVP-10 pending). */
  unavailable: boolean
}

/** Debounced hybrid search. Empty query yields no results and never calls the backend. */
export function useSearch(query: string, debounceMs = 200): SearchState {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed === '') {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      chronicle
        .search(trimmed)
        .then((r) => {
          if (cancelled) return
          setResults(r)
          setUnavailable(false)
        })
        .catch(() => {
          // MVP-10 not wired yet: the handler rejects with "not implemented".
          if (cancelled) return
          setResults([])
          setUnavailable(true)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed, debounceMs])

  return { results, loading, unavailable }
}

// ── Folder / asset grouping helpers ─────────────────────────────────────
// A "project" in the UI is a tracked folder; an asset belongs to the folder
// whose path is the longest prefix of the asset's path.

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

export interface AssetSubfolder {
  /** Immediate subfolder name, or null for files directly in the folder root. */
  name: string | null
  assets: AssetSummary[]
}

/** Groups a folder's assets by their immediate subfolder (root files first). */
export function groupBySubfolder(folder: TrackedFolder, assets: AssetSummary[]): AssetSubfolder[] {
  const sep = folder.path.includes('\\') ? '\\' : '/'
  const groups = new Map<string | null, AssetSummary[]>()
  for (const asset of assetsForFolder(folder, assets)) {
    const relative = asset.path.startsWith(withSep(folder.path))
      ? asset.path.slice(withSep(folder.path).length)
      : asset.path
    const parts = relative.split(/[\\/]/)
    const name = parts.length > 1 ? parts[0]! : null
    groups.set(name, [...(groups.get(name) ?? []), asset])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
    .map(([name, folderAssets]) => ({ name, assets: folderAssets }))
}

/** Aggregate version count across a set of assets. */
export function totalVersions(assets: AssetSummary[]): number {
  return assets.reduce((sum, asset) => sum + asset.versionCount, 0)
}

/** Compact relative-time label from an ISO timestamp (best-effort, no deps). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return new Date(iso).toLocaleDateString()
}

/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}
