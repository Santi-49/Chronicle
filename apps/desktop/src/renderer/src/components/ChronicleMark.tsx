export function ChronicleMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 32 32"
      fill="none"
    >
      <rect x="5" y="8" width="18" height="18" rx="3" />
      <path d="M10 8V6.5A2.5 2.5 0 0 1 12.5 4h12A2.5 2.5 0 0 1 27 6.5v12a2.5 2.5 0 0 1-2.5 2.5H23" />
      <path d="M10 14h8M10 19h6" />
    </svg>
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
