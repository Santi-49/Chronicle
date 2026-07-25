import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { formatById, type FormatId } from '../../../shared/formats'

/**
 * Renders a version/asset thumbnail from its chronicle:// URL.
 *
 * Formats Chromium cannot decode are served as a derived preview by the main
 * process; when a format has no still image at all — or its preview could not
 * be produced — the frame falls back to that format's placeholder icon, so a
 * list row never looks broken.
 */
export function AssetPreview({
  src,
  alt = '',
  className = '',
  format = null,
}: {
  src?: string | null
  alt?: string
  className?: string
  format?: FormatId | null
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  const placeholderIcon = format ? formatById(format).icon : 'image'

  return (
    <div className={`asset-preview ${className}`}>
      {src && !failed ? (
        <img alt={alt} loading="lazy" onError={() => setFailed(true)} src={src} />
      ) : (
        <span className="asset-preview-placeholder" aria-hidden="true">
          <Icon name={placeholderIcon} />
        </span>
      )}
    </div>
  )
}
