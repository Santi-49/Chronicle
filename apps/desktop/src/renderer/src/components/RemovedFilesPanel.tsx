import { useEffect, useRef, useState } from 'react'
import { REMOVED_ASSET_RETENTION_DAYS, type AssetSummary } from '../../../shared/ipc'
import { chronicle } from '../lib/bridge'
import { friendlyError } from '../lib/friendlyError'
import { relativeTime, retentionDaysLeft } from '../lib/useChronicle'
import { Icon } from './Icon'

interface RemovedFilesPanelProps {
  /** Assets in this project whose file is no longer on disk. */
  assets: AssetSummary[]
  onOpenAsset: (assetId: number) => void
}

interface PendingDeletion {
  ids: number[]
  label: string
}

/**
 * Removed files, kept out of the project's main view.
 *
 * A file that left the disk still has a history worth reading, but it is not
 * part of the work in progress — it sits here until its retention window ends
 * (the app deletes it then) or the user deletes it now.
 */
export function RemovedFilesPanel({ assets, onOpenAsset }: RemovedFilesPanelProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<PendingDeletion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (pending) cancelRef.current?.focus()
  }, [pending])

  if (assets.length === 0) return null

  const confirmDelete = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await chronicle.deleteAssetHistory(pending.ids)
      setPending(null)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="removed-panel" aria-labelledby="removed-files-title">
      <button
        aria-expanded={open}
        className="removed-panel-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon name="archive" />
        <span id="removed-files-title">Removed files</span>
        <em>{assets.length}</em>
        <Icon className={open ? 'removed-panel-chevron open' : 'removed-panel-chevron'} name="chevron-right" />
      </button>

      {open && (
        <div className="removed-panel-body">
          <p className="removed-panel-note">
            These files are no longer on disk. Chronicle keeps their stored versions for{' '}
            {REMOVED_ASSET_RETENTION_DAYS} days, then deletes them permanently.
          </p>

          <ul className="removed-list">
            {assets.map((asset) => {
              const daysLeft = retentionDaysLeft(asset.missingSince)
              return (
                <li className="removed-row" key={asset.id}>
                  <button
                    className="removed-row-open"
                    onClick={() => onOpenAsset(asset.id)}
                    type="button"
                  >
                    <strong>{asset.displayName}</strong>
                    <span className="removed-row-meta">
                      <span>{asset.versionCount} versions</span>
                      <span>Removed {relativeTime(asset.missingSince)}</span>
                      <span className={daysLeft <= 3 ? 'removed-row-expiry urgent' : 'removed-row-expiry'}>
                        {daysLeft === 0
                          ? 'Deleting soon'
                          : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                      </span>
                    </span>
                  </button>
                  <button
                    className="danger-text-button"
                    disabled={busy}
                    onClick={() =>
                      setPending({ ids: [asset.id], label: `“${asset.displayName}”` })
                    }
                    type="button"
                  >
                    Delete now
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="removed-panel-actions">
            <button
              className="danger-text-button"
              disabled={busy}
              onClick={() =>
                setPending({
                  ids: assets.map((asset) => asset.id),
                  label: `all ${assets.length} removed file${assets.length === 1 ? '' : 's'}`,
                })
              }
              type="button"
            >
              <Icon name="delete" />
              Delete all removed files
            </button>
          </div>

          {pending && (
            <div
              className="removed-panel-confirm"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !busy) setPending(null)
              }}
              role="group"
              aria-label="Confirm permanent deletion"
            >
              <p>
                Permanently delete the stored version history of {pending.label}? This cannot be
                undone.
              </p>
              <div className="removed-panel-confirm-actions">
                <button
                  className="secondary-button compact-button"
                  disabled={busy}
                  onClick={() => setPending(null)}
                  ref={cancelRef}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="secondary-button compact-button project-delete-history-button"
                  disabled={busy}
                  onClick={() => void confirmDelete()}
                  type="button"
                >
                  <Icon name="delete" />
                  {busy ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="project-removal-error" role="alert">
              Could not delete that history: {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
