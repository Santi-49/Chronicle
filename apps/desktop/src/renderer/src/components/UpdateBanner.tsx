import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useUpdates } from '../lib/useUpdates'
import {
  ignoreUpdateVersion,
  readIgnoredUpdateVersion,
  updateBannerCopy,
} from './updateBannerCopy'

export function UpdateBanner() {
  const { state, restart } = useUpdates()
  const [laterVersion, setLaterVersion] = useState<string | null>(null)
  const [ignoredVersion, setIgnoredVersion] = useState(() => readIgnoredUpdateVersion())
  const [restartError, setRestartError] = useState('')
  const version = state?.availableVersion ?? null
  const copy = state ? updateBannerCopy(state) : null

  useEffect(() => {
    setRestartError('')
  }, [version])

  if (!state || !copy || !version || laterVersion === version || ignoredVersion === version) {
    return null
  }

  return (
    <aside className="update-banner" aria-label="Application update ready" aria-live="polite">
      <div className="update-banner-heading">
        <Icon name="check" />
        <strong>{copy}</strong>
      </div>
      {restartError && <span className="update-banner-error" role="alert">{restartError}</span>}
      <div className="update-banner-actions">
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
        <div className="update-secondary-actions">
          <button
            className="text-button update-dismiss-button"
            onClick={() => setLaterVersion(version)}
            type="button"
          >
            Later
          </button>
          <button
            aria-label={`Ignore Chronicle ${version}`}
            className="text-button update-dismiss-button"
            onClick={() => {
              ignoreUpdateVersion(version)
              setIgnoredVersion(version)
            }}
            type="button"
          >
            Ignore
          </button>
        </div>
      </div>
    </aside>
  )
}
