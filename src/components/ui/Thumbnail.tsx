import { useState, type ImgHTMLAttributes } from 'react';
import clsx from 'clsx';

interface ThumbnailProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

/**
 * 2c: 8 <img> sites, 1 onError handler — everywhere else a missing or broken
 * thumbnail showed the browser's broken-image glyph. This renders the image
 * and swaps in an on-brand fallback (the convergence prism silhouette on an
 * elevated surface) when the image is absent OR fails to load, so real
 * content — dead URLs, feeds with no artwork — degrades to something
 * deliberate.
 */
export function Thumbnail({ src, alt, className, loading, ...rest }: ThumbnailProps) {
  const [failed, setFailed] = useState(!src);

  if (failed || !src) {
    return (
      <div
        data-testid="thumbnail-fallback"
        aria-hidden="true"
        className={clsx(className, 'bg-bg-elevated flex items-center justify-center overflow-hidden')}
        {...rest}
      >
        <span
          className="bg-border-strong"
          style={{ width: '24%', height: '22%', clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
        />
      </div>
    );
  }

  return (
    <img src={src} alt={alt} className={className} loading={loading} onError={() => setFailed(true)} {...rest} />
  );
}
