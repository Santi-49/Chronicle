import { useState } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { relativeTime, useAppStatus, useSearch } from '../lib/useChronicle'
import { getSearchIndexingNotice } from './searchIndexing'

interface SearchScreenProps {
  onOpenVersion: (assetId: number, versionId: number) => void
}

const suggestions = ['blue background', 'tagline removed', 'logo']

export function SearchScreen({ onOpenVersion }: SearchScreenProps) {
  const [query, setQuery] = useState('')
  const { results, loading, unavailable } = useSearch(query)
  const indexingNotice = getSearchIndexingNotice(useAppStatus())
  const hasQuery = query.trim() !== ''

  return (
    <section className="page search-page" aria-labelledby="search-title">
      <PageHeader
        eyebrow="Across every version"
        title="Search history"
        description="Find the moment an idea changed, even when you do not remember the file name."
      />

      <label className="search-field">
        <span className="sr-only">Search version history</span>
        <Icon name="search" />
        <input
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “blue background” or “tagline removed”"
          type="search"
          value={query}
        />
        <kbd>Ctrl K</kbd>
      </label>

      {indexingNotice && (
        <div className="inline-notice search-indexing-notice" role="status" aria-live="polite">
          <Icon name="refresh" />
          <div>
            <strong>{indexingNotice.title}</strong>
            <p>{indexingNotice.description}</p>
          </div>
        </div>
      )}

      {!hasQuery ? (
        <div className="search-start-state">
          <Icon name="clock" />
          <div>
            <h2>Try a search</h2>
            <p>Chronicle searches file names, summaries, changes, and tags together.</p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => setQuery(suggestion)} type="button">{suggestion}</button>
              ))}
            </div>
          </div>
        </div>
      ) : unavailable ? (
        <div className="no-results">
          <Icon name="spark" />
          <h2>Search is warming up</h2>
          <p>Version indexing is still being set up. Keyword and semantic search light up once it is available.</p>
        </div>
      ) : (
        <div className="search-results" aria-live="polite">
          <p className="result-count">
            {loading ? 'Searching…' : `${results.length} ${results.length === 1 ? 'version' : 'versions'} found`}
          </p>
          {results.map(({ version, assetName, snippet, matchedBy }) => (
            <button
              className="search-result"
              key={version.id}
              onClick={() => onOpenVersion(version.assetId, version.id)}
              type="button"
            >
              <AssetPreview src={version.thumbnailUrl} alt={assetName} />
              <span className="search-result-copy">
                <span className="search-result-title"><strong>{assetName}</strong><span>Version {version.versionNumber}</span></span>
                <span>{snippet || version.summary || 'No summary yet'}</span>
                <small>{relativeTime(version.capturedAt)} · matched by {matchedBy}</small>
              </span>
              <Icon name="chevron-right" />
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div className="no-results">
              <Icon name="search" />
              <h2>No matching versions</h2>
              <p>Try fewer words or describe a visual change instead.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
