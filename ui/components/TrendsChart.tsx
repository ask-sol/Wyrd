'use client';
import { useMemo, useState } from 'react';
import type { TrendsRow } from '@/lib/trends';

type Series = 'cost_usd' | 'input_tokens' | 'output_tokens' | 'trace_count' | 'p95_duration_ms' | 'error_count';

function fmtCost(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

const SERIES_META: Record<
  Series,
  { label: string; unit: string; format: (n: number) => string; color: string }
> = {
  cost_usd: {
    label: 'Cost',
    unit: 'USD',
    format: fmtCost,
    color: '#8AB4F8',
  },
  input_tokens: {
    label: 'Input tokens',
    unit: 'tokens',
    format: (n) => Math.round(n).toLocaleString(),
    color: '#7DD3FC',
  },
  output_tokens: {
    label: 'Output tokens',
    unit: 'tokens',
    format: (n) => Math.round(n).toLocaleString(),
    color: '#F472B6',
  },
  trace_count: {
    label: 'Traces',
    unit: 'runs',
    format: (n) => Math.round(n).toLocaleString(),
    color: '#A1B6D6',
  },
  p95_duration_ms: {
    label: 'p95 duration',
    unit: 'ms',
    format: (n) => (n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(2)}s`),
    color: '#FBBF24',
  },
  error_count: {
    label: 'Errors',
    unit: 'errors',
    format: (n) => Math.round(n).toLocaleString(),
    color: '#F87171',
  },
};

export function TrendsChart({ buckets, defaultSeries = 'cost_usd' }: { buckets: TrendsRow[]; defaultSeries?: Series }) {
  const [series, setSeries] = useState<Series>(defaultSeries);
  const meta = SERIES_META[series];

  const values = useMemo(() => buckets.map((b) => {
    const v = b[series];
    return typeof v === 'number' ? v : 0;
  }), [buckets, series]);

  const max = useMemo(() => {
    const m = Math.max(0, ...values);
    if (m === 0) return 0;
    // Round up to a "nice" axis maximum so tiny values aren't invisible.
    const magnitude = Math.pow(10, Math.floor(Math.log10(m)));
    const norm = m / magnitude;
    let nice: number;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * magnitude;
  }, [values]);

  if (buckets.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-sm text-ink2">No data in this window</div>
        <p className="text-xs text-ink3 mt-1">Capture some traces and they'll show up here.</p>
      </div>
    );
  }

  // SVG layout.
  const W = 720;
  const H = 200;
  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  // Cap bar width so single-bucket charts don't render one giant bar.
  const barW = Math.max(2, Math.min(64, plotW / values.length - 4));
  const slotW = plotW / values.length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-sm font-medium text-ink">{meta.label}</div>
          <div className="text-xs text-ink3 mt-0.5">
            Per {buckets[0] && buckets[1] && buckets[1].bucket_start_ms - buckets[0].bucket_start_ms < 86_400_000 ? 'hour' : 'day'} ·{' '}
            <span className="font-mono">{meta.format(values.reduce((a, b) => a + b, 0))}</span> total
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(SERIES_META) as Series[]).map((s) => (
            <button
              key={s}
              onClick={() => setSeries(s)}
              className={`h-7 px-2.5 rounded-pill border text-2xs font-medium transition-colors ${
                series === s
                  ? 'bg-brandSoft border-brandBorder text-brand'
                  : 'bg-surface border-border text-ink3 hover:text-ink hover:bg-hover'
              }`}
            >
              {SERIES_META[s].label}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* y-axis ticks */}
        {[0, 0.5, 1].map((p) => {
          const y = PAD_T + plotH * (1 - p);
          return (
            <g key={`y-${p}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                stroke="#282A2C"
                strokeWidth={1}
                strokeDasharray={p === 0 ? '' : '2 4'}
              />
              <text
                x={PAD_L - 8}
                y={y + 3}
                fontSize={10}
                fontFamily="monospace"
                textAnchor="end"
                fill="#9AA0A6"
              >
                {meta.format(max * p)}
              </text>
            </g>
          );
        })}
        {/* bars (centered within their slot) */}
        {values.map((v, i) => {
          const slotCenter = PAD_L + slotW * i + slotW / 2;
          const x = slotCenter - barW / 2;
          const h = max === 0 ? 0 : (v / max) * plotH;
          // Ensure a non-zero value renders at least a 2-px sliver so users see *something*.
          const renderH = v > 0 ? Math.max(2, h) : 0;
          const y = PAD_T + plotH - renderH;
          return (
            <rect
              key={`bar-${i}`}
              x={x}
              y={y}
              width={barW}
              height={renderH}
              fill={meta.color}
              opacity={v > 0 ? 0.85 : 0.15}
              rx={2}
            >
              <title>{`${new Date(buckets[i]!.bucket_start_ms).toLocaleString()} · ${meta.format(v)}`}</title>
            </rect>
          );
        })}
        {/* x-axis labels: first, middle, last (deduped for tiny ranges) */}
        {Array.from(
          new Set(
            [0, Math.floor((values.length - 1) / 2), values.length - 1].filter(
              (i) => i >= 0 && i < buckets.length,
            ),
          ),
        ).map((i) => {
          const x = PAD_L + slotW * i + slotW / 2;
          const d = new Date(buckets[i]!.bucket_start_ms);
          const isHourly =
            buckets[1] && buckets[1].bucket_start_ms - buckets[0]!.bucket_start_ms < 86_400_000;
          const label = isHourly
            ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
          return (
            <text
              key={`tick-${i}`}
              x={x}
              y={H - 10}
              fontSize={10}
              fontFamily="monospace"
              textAnchor="middle"
              fill="#9AA0A6"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
