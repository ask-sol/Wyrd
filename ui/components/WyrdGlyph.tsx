interface Props {
  size?: number;
  className?: string;
  title?: string;
}

export function WyrdGlyph({ size = 22, className, title = 'Wyrd' }: Props) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id="wyrd-g-a" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8AB4F8" />
          <stop offset="1" stopColor="#1A73E8" />
        </linearGradient>
        <linearGradient id="wyrd-g-b" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C58AF9" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" stroke="url(#wyrd-g-a)" strokeWidth="1.6" />
      <path d="M5 12a7 7 0 0 1 14 0" stroke="url(#wyrd-g-b)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="url(#wyrd-g-a)" />
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3"
        stroke="url(#wyrd-g-a)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
