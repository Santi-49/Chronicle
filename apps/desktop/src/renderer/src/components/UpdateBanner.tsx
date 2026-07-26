import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useUpdates } from '../lib/useUpdates'
import { updateBannerCopy } from './updateBannerCopy'

export function UpdateBanner() {
  const { state, restart } = useUpdates()
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [restartError, setRestartError] = useState('')
  const key = state ? `${state.phase}:${state.availableVersion ?? ''}` : ''
  const copy = state ? updateBannerCopy(state) : null

  useEffect(() => {
    setRestartError('')
  }, [key])

  if (!state || !copy || dismissedKey === key) return null

  return (
    <aside className="update-banner" aria-label="Application update" aria-live="polite">
      <Icon name={state.phase === 'ready' ? 'check' : 'arrow-down'} />
      <div className="update-banner-copy">
        <strong>{copy}</strong>
        {state.phase === 'downloading' && (
          <div className="update-progress-row">
            <progress
              aria-label={`Update download ${state.percent ?? 0}%`}
              max="100"
              value={state.percent ?? 0}
            />
            <span>{state.percent ?? 0}%</span>
          </div>
        )}
        {restartError && <span className="update-banner-error" role="alert">{restartError}</span>}
      </div>
      <div className="update-banner-actions">
        {state.phase === 'ready' && (
          <button
            className="primary-button update-restart-button"
            onClick={() => {
              setRestartError('')
              void restart().catch(() => {
                setRestartError('Chronicle could not restart. Try again or reopen the app.')
              })
            }}
            type="button"
          >
            Restart to update
          </button>
        )}
        <button
          aria-label={state.phase === 'ready' ? 'Install this update later' : 'Dismiss update notice'}
          className="update-dismiss-button"
          onClick={() => setDismissedKey(key)}
          type="button"
        >
          {state.phase === 'ready' ? 'Later' : <Icon name="close" />}
        </button>
      </div>
    </aside>
  )
}
