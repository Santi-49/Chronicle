import { useEffect, useRef, useState } from 'react'
import { ChronicleMark } from './ChronicleMark'
import { Icon } from './Icon'
import { useUpdates } from '../lib/useUpdates'
import {
  ignoreUpdateVersion,
  readIgnoredUpdateVersion,
  updateBannerCopy,
} from './updateBannerCopy'

export function UpdateBanner() {
  const { state, restart, openDownload } = useUpdates()
  const [laterVersion, setLaterVersion] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const actionRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [ignoredVersion, setIgnoredVersion] = useState(() => readIgnoredUpdateVersion())
  const [actionError, setActionError] = useState('')
  const version = state?.availableVersion ?? null
  const presentation = state ? updateBannerCopy(state) : null

  useEffect(() => {
    setActionError('')
  }, [version])

  useEffect(() => {
    setMenuOpen(false)
  }, [state?.phase])

  useEffect(() => {
    if (!menuOpen) return

    const focusTimer = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    })
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        window.setTimeout(() => actionRef.current?.focus())
      }
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const manual = presentation?.action === 'download'

  // One primary action per delivery mode: Windows relaunches into the installed
  // update, macOS opens the published installer in the browser.
  const runPrimaryAction = () => {
    setMenuOpen(false)
    setActionError('')
    const attempt = manual ? openDownload() : restart()
    void attempt.catch(() => {
      setActionError(manual
        ? 'Chronicle could not open the download. Try again, or use Update help in Settings.'
        : 'Chronicle could not restart. Try again or reopen the app.')
    })
  }

  const ignoreVersion = () => {
    if (!version) return
    setMenuOpen(false)
    ignoreUpdateVersion(version)
    setIgnoredVersion(version)
  }

  if (
    !state
    || !presentation
    || !version
    || laterVersion === version
    || ignoredVersion === version
  ) {
    return null
  }

  if (presentation.action === 'progress') {
    return (
      <aside
        className="update-banner update-banner-downloading"
        aria-label="Application update downloading"
        aria-live="polite"
      >
        <span aria-hidden="true" className="update-spinner" />
        <span>{presentation.copy}</span>
      </aside>
    )
  }

  return (
    <aside
      className="update-banner update-banner-ready"
      aria-label={manual ? 'Application update available' : 'Application update ready'}
      aria-live="polite"
    >
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`${presentation.copy}, Chronicle ${version}. Click to ${
          manual ? 'download' : 'restart'
        }. Right-click for more options.`}
        className="update-ready-action"
        onClick={runPrimaryAction}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            setMenuOpen(true)
          }
        }}
        ref={actionRef}
        title={
          manual
            ? 'Click to download · Right-click for more options'
            : 'Click to restart · Right-click for more options'
        }
        type="button"
      >
        <span className="update-ready-icon"><ChronicleMark size={24} /></span>
        <span className="update-ready-copy">
          <strong>{presentation.copy}</strong>
          <small>v{version}</small>
        </span>
        <Icon className="update-ready-chevron" name="chevron-right" />
      </button>
      {menuOpen && (
        <div
          aria-label="Update actions"
          className="update-context-menu"
          ref={menuRef}
          role="menu"
        >
          <span className="update-context-menu-title">Update options</span>
          <button onClick={runPrimaryAction} role="menuitem" type="button">
            <Icon name={manual ? 'download' : 'refresh'} />
            <span>
              <strong>{manual ? 'Download installer' : 'Restart now'}</strong>
              <small>{manual ? `Opens v${version} in your browser` : `Install v${version}`}</small>
            </span>
          </button>
          <button
            onClick={() => {
              setMenuOpen(false)
              setLaterVersion(version)
            }}
            role="menuitem"
            type="button"
          >
            <Icon name="clock" />
            <span>
              <strong>Remind me later</strong>
              <small>Show again next launch</small>
            </span>
          </button>
          <button onClick={ignoreVersion} role="menuitem" type="button">
            <Icon name="close" />
            <span>
              <strong>Skip this version</strong>
              <small>Don’t offer v{version} again</small>
            </span>
          </button>
        </div>
      )}
      {actionError && <span className="update-banner-error" role="alert">{actionError}</span>}
    </aside>
  )
}
