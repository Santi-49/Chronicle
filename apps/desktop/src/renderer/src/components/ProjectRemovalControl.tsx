import { useEffect, useId, useRef, useState } from 'react'
import { chronicle } from '../lib/bridge'
import { Icon } from './Icon'

interface ProjectRemovalControlProps {
  projectId: number
  projectName: string
  onRemoved: () => void
  compact?: boolean
}

/** Two-step, keyboard-safe removal. Removing a project never deletes stored history. */
export function ProjectRemovalControl({
  projectId,
  projectName,
  onRemoved,
  compact = false,
}: ProjectRemovalControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await chronicle.removeFolder(projectId)
      onRemoved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
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
        <strong>Stop tracking “{projectName}”?</strong>
        <p id={descriptionId}>The folder will no longer be watched. Stored version history stays on this device.</p>
      </div>
      <div className="project-removal-actions">
        <button
          className="secondary-button compact-button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          ref={cancelRef}
          type="button"
        >
          Cancel
        </button>
        <button className="danger-button compact-button" disabled={busy} onClick={() => void remove()} type="button">
          <Icon name="delete" />
          {busy ? 'Removing…' : 'Stop tracking'}
        </button>
      </div>
      {error && <p className="project-removal-error" role="alert">Could not remove the project: {error}</p>}
    </div>
  )
}
