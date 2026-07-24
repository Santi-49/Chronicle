import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useAppStatus } from '../lib/useChronicle'
import { chronicle } from '../lib/bridge'

/**
 * Footer status bar (spec F1 "see watcher/job/connectivity status"). Reads the
 * live C1 AppStatus and updates from the `statusChanged` event. The trailing
 * slot shows real account state (local vs. signed in) rather than static branding.
 */
export function StatusBar({ onOpenJobs }: { onOpenJobs: () => void }) {
  const status = useAppStatus()
  const pendingAi = (status?.pendingJobs.ai ?? 0) + (status?.pendingJobs.embedding ?? 0)
  const failedAi = status?.failedJobs ?? 0
  const actionableAi = pendingAi + failedAi

  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    void chronicle.getAccountState().then((state) => setEmail(state.email))
  }, [])

  return (
    <footer className="status-bar" aria-label="Application status">
      <span className="status-item">
        <Icon name="folder" />
        {status ? `${status.watchedFolders} watched` : '—'}
      </span>

      <span className="status-item">
        <span className={`status-dot ${status?.online ? 'status-dot-online' : 'status-dot-offline'}`} aria-hidden="true" />
        {status ? (status.online ? 'Online' : 'Offline') : '—'}
      </span>

      <span className="status-item">
        <Icon name="spark" />
        {status?.aiConfigured ? 'AI ready' : 'AI not configured'}
      </span>

      {actionableAi > 0 && (
        <button
          aria-label={`View AI jobs: ${pendingAi} pending, ${failedAi} failed`}
          className="status-item status-item-busy status-item-button"
          onClick={onOpenJobs}
          type="button"
        >
          <Icon name="refresh" />
          <span aria-live="polite">
            {pendingAi > 0 && `${pendingAi} pending`}
            {pendingAi > 0 && failedAi > 0 && ' · '}
            {failedAi > 0 && `${failedAi} failed`}
          </span>
        </button>
      )}

      <span className="status-spacer" />
      <span className="status-item status-brand">{email ? `Signed in as ${email}` : 'Local mode'}</span>
    </footer>
  )
}
