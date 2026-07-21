import type { CSSProperties } from 'react'
import markDarkUrl from '../../../../../../packages/brand/assets/chronicle-mark-dark.svg'
import markLightUrl from '../../../../../../packages/brand/assets/chronicle-mark-light.svg'

/** Shared Chronicle mark; SVG sources live in packages/brand for cross-app reuse. */
export function ChronicleMark({ size = 32 }: { size?: number }) {
  const style = { '--brand-mark-size': `${size}px` } as CSSProperties

  return (
    <span
      aria-hidden="true"
      className="brand-mark"
      style={style}
    >
      <img alt="" className="brand-mark-image brand-mark-image-dark" src={markDarkUrl} />
      <img alt="" className="brand-mark-image brand-mark-image-light" src={markLightUrl} />
    </span>
  )
}

export function BrandLockup() {
  return (
    <div className="brand-lockup">
      <ChronicleMark />
      <span>Chronicle</span>
    </div>
  )
}
