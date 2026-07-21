import { useEffect, useId, useRef, useState } from 'react'
import { chronicle } from '../lib/bridge'
import { Icon } from './Icon'
import type { ProjectRemovalMode } from '../../../shared/ipc'

interface ProjectRemovalControlProps {
  projectId: number
  projectName: string
  onRemoved: () => void
  compact?: boolean
}

/** Keyboard-safe choice between untracking and permanent local deletion. */
export function ProjectRemovalControl({
  projectId,
  projectName,
  onRemoved,
  compact = false,
}: ProjectRemovalControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<ProjectRemovalMode | null>(null)
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hasOpened = useRef(false)

  useEffect(() => {
    if (confirming) {
      hasOpened.current = true
      cancelRef.current?.focus()
    } else if (hasOpened.current) {
      triggerRef.current?.focus()
    }
  }, [confirming])

  const remove = async (mode: ProjectRemovalMode) => {
    setBusy(true)
    setPendingMode(mode)
    setError(null)
    try {
      await chronicle.removeFolder(projectId, mode)
      onRemoved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
      setPendingMode(null)
    }
  }

  if (!confirming) {
    return (
      <button
        className={compact ? 'danger-text-button' : 'danger-button'}
        onClick={() => setConfirming(true)}
        ref={triggerRef}
        type="button"
      >
        {!compact && <Icon name="delete" />}
        {compact ? 'Remove' : 'Remove project'}
      </button>
    )
  }

  return (
    <div
      aria-describedby={descriptionId}
      aria-label={`Confirm removal of ${projectName}`}
      className={`project-removal-confirmation${compact ? ' project-removal-compact' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) setConfirming(false)
      }}
      role="group"
    >
      <div>
        <strong>Remove “{projectName}”?</strong>
        <p id={descriptionId}>Both options stop tracking the folder. Choose whether to keep or permanently delete Chronicle’s stored version history. Your original files are never deleted.</p>
      </div>
      <div className="project-removal-actions">
        <button
          className="secondary-button compact-button project-removal-cancel"
          disabled={busy}
          onClick={() => setConfirming(false)}
          ref={cancelRef}
          type="button"
        >
          Cancel
        </button>
        <button
          className="secondary-button compact-button project-delete-history-button"
          disabled={busy}
          onClick={() => void remove('delete-history')}
          type="button"
        >
          <Icon name="delete" />
          {pendingMode === 'delete-history' ? 'Deleting…' : 'Delete project and history'}
        </button>
        <button
          className="secondary-button compact-button"
          disabled={busy}
          onClick={() => void remove('keep-history')}
          type="button"
        >
          <Icon name="delete" />
          {pendingMode === 'keep-history' ? 'Deleting…' : 'Delete project, keep history'}
        </button>
      </div>
      {error && <p className="project-removal-error" role="alert">Could not remove the project: {error}</p>}
    </div>
  )
}
