interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  accent?: 'default' | 'brand' | 'success' | 'danger' | 'muted';
}

const accentClass: Record<NonNullable<KpiProps['accent']>, string> = {
  default: 'text-ink',
  brand: 'text-brandStrong',
  success: 'text-success',
  danger: 'text-danger',
  muted: 'text-ink3',
};

export function KpiCard({ label, value, hint, accent = 'default' }: KpiProps) {
  return (
    <div className="bg-surface border border-border rounded-md p-4 min-w-[140px]">
      <div className="text-xs text-ink3 mb-1.5">{label}</div>
      <div className={`text-2xl font-normal tabular ${accentClass[accent]}`}>{value}</div>
      {hint && <div className="text-xs text-ink3 mt-2">{hint}</div>}
    </div>
  );
}
