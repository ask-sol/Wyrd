'use client';

interface Segment<T extends string> {
  id: T;
  label: string;
  badge?: string | number;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
}

export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  return (
    <div className="inline-flex items-center rounded-pill border border-border bg-surface p-0.5">
      {segments.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`inline-flex items-center gap-1.5 h-8 px-4 rounded-pill text-sm font-medium transition-colors ${
              active
                ? 'bg-brandSoft text-brandStrong'
                : 'text-ink3 hover:text-ink hover:bg-hover'
            }`}
            aria-pressed={active}
          >
            {s.label}
            {s.badge !== undefined && (
              <span
                className={`px-1.5 h-5 inline-flex items-center text-2xs font-mono rounded-pill ${
                  active ? 'bg-surface text-brandStrong border border-brandBorder' : 'bg-subtle text-ink3'
                }`}
              >
                {s.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
