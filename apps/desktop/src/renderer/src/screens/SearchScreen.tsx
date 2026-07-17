import { useMemo, useState } from 'react'
import { AssetPreview } from '../components/AssetPreview'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { assets } from '../data/demoData'

interface SearchScreenProps {
  onOpenVersion: (assetId: string, versionId: string) => void
}

const suggestions = ['blue campaign', 'typography changes', 'packaging label']

export function SearchScreen({ onOpenVersion }: SearchScreenProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!normalizedQuery) return []
    return assets.flatMap((asset) =>
      asset.versions
        .filter((version) => {
          const searchable = [asset.name, version.summary, ...version.tags].join(' ').toLowerCase()
          return normalizedQuery.split(/\s+/).some((term) => searchable.includes(term))
        })
        .map((version) => ({ asset, version }))
    )
  }, [normalizedQuery])

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
          placeholder="Try “blue campaign” or “label changed”"
          type="search"
          value={query}
        />
        <kbd>Ctrl K</kbd>
      </label>

      {!normalizedQuery ? (
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
      ) : (
        <div className="search-results" aria-live="polite">
          <p className="result-count">{results.length} {results.length === 1 ? 'version' : 'versions'} found</p>
          {results.length > 0 ? results.map(({ asset, version }) => (
            <button
              className="search-result"
              key={`${asset.id}-${version.id}`}
              onClick={() => onOpenVersion(asset.id, version.id)}
              type="button"
            >
              <AssetPreview variant={asset.variant} />
              <span className="search-result-copy">
                <span className="search-result-title"><strong>{asset.name}</strong><span>Version {version.number}</span></span>
                <span>{version.summary}</span>
                <small>{version.createdAt} · {version.tags.join(' · ')}</small>
              </span>
              <Icon name="chevron-right" />
            </button>
          )) : (
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
