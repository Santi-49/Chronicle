import type { PreviewVariant } from '../data/demoData'

export function AssetPreview({ variant, className = '' }: { variant: PreviewVariant; className?: string }) {
  return (
    <div className={`asset-preview asset-preview-${variant} ${className}`} aria-hidden="true">
      {variant === 'campaign' && <><span className="preview-kicker">AURORA</span><strong>Move with<br />the light.</strong><i /></>}
      {variant === 'editorial' && <><span className="preview-issue">ISSUE 08</span><strong>FIELD<br />NOTES</strong><i /></>}
      {variant === 'packaging' && <><i /><strong>NORTH</strong><span>ROASTED SLOWLY</span></>}
      {variant === 'poster' && <><strong>KINETIC</strong><span>FORM / TYPE / SOUND</span><i>24</i></>}
    </div>
  )
}
