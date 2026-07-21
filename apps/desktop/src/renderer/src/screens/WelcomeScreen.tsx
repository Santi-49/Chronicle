import { useEffect, useState } from 'react'
import { BrandLockup } from '../components/ChronicleMark'
import { GoogleMark } from '../components/GoogleMark'
import { Icon } from '../components/Icon'
import { chronicle } from '../lib/bridge'
import { friendlyError } from '../lib/friendlyError'

interface WelcomeScreenProps {
  onContinue: () => void
  onContinueGoogle: () => Promise<void>
}

export function WelcomeScreen({ onContinue, onContinueGoogle }: WelcomeScreenProps) {
  const [googleState, setGoogleState] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [controlPlaneAvailable, setControlPlaneAvailable] = useState(false)

  const checkControlPlane = async () => {
    const available = await chronicle.checkControlPlaneHealth().catch(() => false)
    setControlPlaneAvailable(available)
  }

  useEffect(() => { void checkControlPlane() }, [])

  const signIn = async () => {
    setGoogleBusy(true)
    setGoogleState(null)
    try {
      await onContinueGoogle()
    } catch (error) {
      setGoogleState(friendlyError(error))
    } finally {
      setGoogleBusy(false)
    }
  }
  return (
    <main className="welcome-screen">
      <section className="welcome-story" aria-labelledby="welcome-title">
        <BrandLockup />

        <div className="story-copy">
          <p className="eyebrow">Creative history, remembered</p>
          <h1 id="welcome-title">Every version tells a story.</h1>
          <p className="story-description">
            Chronicle quietly keeps track of your creative work, so every idea and every
            change stays within reach.
          </p>
        </div>

        <div className="version-preview" aria-hidden="true">
          <div className="preview-card preview-card-back">
            <span>Brand refresh</span>
            <small>Version 01</small>
          </div>
          <div className="preview-card preview-card-middle">
            <span>Brand refresh</span>
            <small>Version 02</small>
          </div>
          <div className="preview-card preview-card-front">
            <div className="preview-art">
              <span />
              <span />
            </div>
            <div>
              <span>Brand refresh</span>
              <small>Version 03 · Latest</small>
            </div>
          </div>
        </div>
      </section>

      <section className="welcome-access" aria-label="Choose how to continue">
        <div className="access-card">
          <p className="eyebrow">Welcome</p>
          <h2>Start your Chronicle</h2>
          <p className="access-description">
            Keep your history on this device. You can connect an account later.
          </p>

          <div className="access-actions">
            <button className="primary-button" onClick={onContinue} type="button">
              Continue local
              <Icon name="chevron-right" />
            </button>

            {controlPlaneAvailable && (
              <>
                <div className="divider" aria-hidden="true">
                  <span>or</span>
                </div>
                <button className="google-button" disabled={googleBusy} onClick={() => void signIn()} type="button">
                  <span className="google-button-label"><GoogleMark />{googleBusy ? 'Connecting…' : 'Continue with Google'}</span>
                </button>
                {googleState && <p className="inline-status inline-status-error" role="status">{googleState}</p>}
              </>
            )}
          </div>

          <p className="privacy-note">
            Local mode works without an account. Chronicle registers a random installation ID
            when online; creative files, names, paths, summaries, and searches stay out of the
            control plane.
          </p>
        </div>
      </section>
    </main>
  )
}
