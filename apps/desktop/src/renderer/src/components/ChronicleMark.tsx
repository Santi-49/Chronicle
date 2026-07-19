/**
 * ChronicleMark — Concept A icon
 *
 * Three offset rectangles (version layers) + a clock (time/history) inside the
 * front layer, with a green minute hand (new version just captured).
 *
 * To replace the logo, edit only this file.
 */
export function ChronicleMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Layer 3 — oldest version (back) */}
      <rect x="2"  y="5"  width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      {/* Layer 2 — middle version */}
      <rect x="5"  y="8"  width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.4" opacity="0.65" />
      {/* Layer 1 — latest version (front) */}
      <rect x="8"  y="11" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      {/* Clock face */}
      <circle cx="17.5" cy="18" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      {/* Hour hand (12 o'clock) */}
      <line x1="17.5" y1="18" x2="17.5" y2="14.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* Minute hand (green accent = new version) */}
      <line x1="17.5" y1="18" x2="20.2" y2="19.6" stroke="#4ade80" strokeWidth="1.3" strokeLinecap="round" />
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
