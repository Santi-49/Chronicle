import { useEffect, useState } from 'react'
import { Icon } from './Icon'

/**
 * Renders a version/asset thumbnail from its chronicle:// image URL. Falls back
 * to a neutral placeholder while a capture has no image yet or fails to load.
 */
export function AssetPreview({
  src,
  alt = '',
  className = '',
}: {
  src?: string
  alt?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  return (
    <div className={`asset-preview ${className}`}>
      {src && !failed ? (
        <img alt={alt} loading="lazy" onError={() => setFailed(true)} src={src} />
      ) : (
        <span className="asset-preview-placeholder" aria-hidden="true">
          <Icon name="image" />
        </span>
      )}
    </div>
  )
}
