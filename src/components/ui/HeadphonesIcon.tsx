interface HeadphonesIconProps {
  size?: number;
  className?: string;
  'data-testid'?: string;
}

/**
 * The default podcast artwork: a solid headphones silhouette, the shape of 🎧.
 * Filled (not stroked) so it reads as one clean shape at any size and takes
 * its colour from the surrounding text colour.
 */
export function HeadphonesIcon({ size = 48, className, ...rest }: HeadphonesIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      data-testid={rest['data-testid']}
    >
      <path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 0 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z" />
    </svg>
  );
}
