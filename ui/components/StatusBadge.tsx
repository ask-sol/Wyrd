import type { SpanStatus } from 'wyrd';

const styles: Record<
  SpanStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  ok: {
    bg: 'bg-successSoft',
    text: 'text-success',
    border: 'border-successBorder',
    dot: 'bg-success',
    label: 'Healthy',
  },
  error: {
    bg: 'bg-dangerSoft',
    text: 'text-danger',
    border: 'border-dangerBorder',
    dot: 'bg-danger',
    label: 'Failed',
  },
  running: {
    bg: 'bg-warningSoft',
    text: 'text-warning',
    border: 'border-warningBorder',
    dot: 'bg-warning',
    label: 'Running',
  },
};

export function StatusBadge({ status, size = 'md' }: { status: SpanStatus; size?: 'sm' | 'md' }) {
  const s = styles[status];
  const sz = size === 'sm' ? 'h-5 px-1.5 text-2xs gap-1' : 'h-6 px-2.5 text-xs gap-1.5';
  return (
    <span
      className={`inline-flex items-center ${sz} rounded-pill ${s.bg} ${s.text} border ${s.border} font-medium`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
