import { describe, expect, it } from 'vitest'
import type { AppStatus } from '../../../shared/ipc'
import { getSearchIndexingNotice } from './searchIndexing'

function status(overrides: Partial<AppStatus> = {}): AppStatus {
  return {
    watchedFolders: 1,
    online: true,
    pendingJobs: { ai: 0, embedding: 1, telemetry: 0 },
    aiConfigured: true,
    ...overrides,
  }
}

describe('getSearchIndexingNotice', () => {
  it('stays hidden until app status loads or when no embeddings are pending', () => {
    expect(getSearchIndexingNotice(undefined)).toBeNull()
    expect(getSearchIndexingNotice(status({ pendingJobs: { ai: 2, embedding: 0, telemetry: 0 } }))).toBeNull()
  })

  it('explains that keyword search remains available during indexing', () => {
    expect(getSearchIndexingNotice(status())).toEqual({
      title: 'Semantic indexing in progress',
      description:
        '1 recent version is still being indexed. Keyword search works now; meaning-based matches will improve as indexing finishes.',
    })
  })

  it('uses plural offline guidance for multiple queued versions', () => {
    expect(
      getSearchIndexingNotice(
        status({ online: false, pendingJobs: { ai: 0, embedding: 3, telemetry: 0 } }),
      ),
    ).toEqual({
      title: 'Semantic indexing paused while offline',
      description:
        '3 recent versions are waiting to be indexed. Keyword search still works offline; meaning-based matches will improve when Chronicle reconnects.',
    })
  })

  it('points to Settings when AI is not configured', () => {
    expect(getSearchIndexingNotice(status({ aiConfigured: false }))).toEqual({
      title: 'Semantic indexing needs AI setup',
      description:
        '1 recent version is waiting to be indexed. Keyword search works now; configure AI in Settings to add meaning-based matches.',
    })
  })
})
