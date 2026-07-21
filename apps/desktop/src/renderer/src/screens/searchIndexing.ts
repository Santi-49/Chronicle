import type { AppStatus } from '../../../shared/ipc'

export interface SearchIndexingNotice {
  title: string
  description: string
}

/** Explains why recent versions may not appear in meaning-based search yet. */
export function getSearchIndexingNotice(status: AppStatus | undefined): SearchIndexingNotice | null {
  const pending = status?.pendingJobs.embedding ?? 0
  if (pending === 0) return null

  const versions = `${pending} recent ${pending === 1 ? 'version is' : 'versions are'}`
  if (!status?.aiConfigured) {
    return {
      title: 'Semantic indexing needs AI setup',
      description: `${versions} waiting to be indexed. Keyword search works now; configure AI in Settings to add meaning-based matches.`,
    }
  }
  if (!status.online) {
    return {
      title: 'Semantic indexing paused while offline',
      description: `${versions} waiting to be indexed. Keyword search still works offline; meaning-based matches will improve when Chronicle reconnects.`,
    }
  }
  return {
    title: 'Semantic indexing in progress',
    description: `${versions} still being indexed. Keyword search works now; meaning-based matches will improve as indexing finishes.`,
  }
}
