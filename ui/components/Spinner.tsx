interface Props {
  size?: number;
  className?: string;
  /** Stroke color (defaults to current text color). */
  color?: string;
}

export function Spinner({ size = 16, className, color }: Props) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block align-[-2px] ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className="animate-spin"
        style={{ color: color ?? 'currentColor' }}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function SkeletonBlock({
  className,
  height = 16,
  width,
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
}) {
  return (
    <span
      aria-hidden
      className={`block rounded bg-subtle relative overflow-hidden ${className ?? ''}`}
      style={{
        height,
        width: width ?? '100%',
      }}
    >
      <span className="absolute inset-0 shimmer" />
    </span>
  );
}
