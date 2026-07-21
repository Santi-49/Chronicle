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
  return (
    <div className={`asset-preview ${className}`}>
      {src ? (
        <img alt={alt} loading="lazy" src={src} />
      ) : (
        <span className="asset-preview-placeholder" aria-hidden="true">
          <Icon name="image" />
        </span>
      )}
    </div>
  )
}
