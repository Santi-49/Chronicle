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
  const { state, restart } = useUpdates()
  const [laterVersion, setLaterVersion] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const actionRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [ignoredVersion, setIgnoredVersion] = useState(() => readIgnoredUpdateVersion())
  const [restartError, setRestartError] = useState('')
  const version = state?.availableVersion ?? null
  const copy = state ? updateBannerCopy(state) : null

  useEffect(() => {
    setRestartError('')
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

  const restartUpdate = () => {
    setMenuOpen(false)
    setRestartError('')
    void restart().catch(() => {
      setRestartError('Chronicle could not restart. Try again or reopen the app.')
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
    || !copy
    || !version
    || laterVersion === version
    || ignoredVersion === version
  ) {
    return null
  }

  if (state.phase === 'available' || state.phase === 'downloading') {
    return (
      <aside
        className="update-banner update-banner-downloading"
        aria-label="Application update downloading"
        aria-live="polite"
      >
        <span aria-hidden="true" className="update-spinner" />
        <span>{copy}</span>
      </aside>
    )
  }

  return (
    <aside
      className="update-banner update-banner-ready"
      aria-label="Application update ready"
      aria-live="polite"
    >
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`${copy}, Chronicle ${version}. Click to restart. Right-click for more options.`}
        className="update-ready-action"
        onClick={restartUpdate}
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
        title="Click to restart · Right-click for more options"
        type="button"
      >
        <span className="update-ready-icon"><ChronicleMark size={24} /></span>
        <span className="update-ready-copy">
          <strong>{copy}</strong>
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
          <button onClick={restartUpdate} role="menuitem" type="button">
            <Icon name="refresh" />
            <span>
              <strong>Restart now</strong>
              <small>Install v{version}</small>
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
      {restartError && <span className="update-banner-error" role="alert">{restartError}</span>}
    </aside>
  )
}
