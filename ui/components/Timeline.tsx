'use client';
import type { WyrdSpan } from '@/lib/types';
import { kindBarClass, KindBadge } from './KindBadge';
import { formatCost, formatDuration } from '@/lib/format';

interface TimelineNode {
  span: WyrdSpan;
  depth: number;
}

function flattenTree(spans: readonly WyrdSpan[]): TimelineNode[] {
  const byParent = new Map<string | null, WyrdSpan[]>();
  for (const s of spans) {
    const arr = byParent.get(s.parent_span_id) ?? [];
    arr.push(s);
    byParent.set(s.parent_span_id, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.started_at - b.started_at);
  const out: TimelineNode[] = [];
  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const s of children) {
      out.push({ span: s, depth });
      walk(s.span_id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

interface Props {
  spans: WyrdSpan[];
  selectedId: string | null;
  onSelect: (spanId: string) => void;
}

const NAME_COL_WIDTH = 320;

export function Timeline({ spans, selectedId, onSelect }: Props) {
  if (spans.length === 0) return <div className="text-sm text-ink3 p-6">No spans recorded.</div>;
  const nodes = flattenTree(spans);
  const traceStart = Math.min(...spans.map((s) => s.started_at));
  const traceEnd = Math.max(...spans.map((s) => s.ended_at ?? s.started_at));
  const range = Math.max(traceEnd - traceStart, 1);

  return (
    <div className="text-sm">
      <div
        className="relative h-7 mb-2 border-b border-divider"
        style={{ marginLeft: NAME_COL_WIDTH }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <div
            key={p}
            className="absolute top-0 h-full flex flex-col justify-end pb-1.5"
            style={{ left: `${p * 100}%` }}
          >
            <span className="text-xs font-mono text-ink3 tabular">
              {formatDuration(Math.round(p * range))}
            </span>
          </div>
        ))}
        {[0.25, 0.5, 0.75].map((p) => (
          <div
            key={`tick-${p}`}
            className="absolute top-0 bottom-0 border-l border-dashed border-divider"
            style={{ left: `${p * 100}%` }}
          />
        ))}
      </div>

      <div className="space-y-px">
        {nodes.map(({ span, depth }) => {
          const isSelected = span.span_id === selectedId;
          const startOffset = ((span.started_at - traceStart) / range) * 100;
          const widthPercent = span.ended_at
            ? ((span.ended_at - span.started_at) / range) * 100
            : 100 - startOffset;
          const cost =
            typeof span.attributes['gen_ai.usage.cost_usd'] === 'number'
              ? (span.attributes['gen_ai.usage.cost_usd'] as number)
              : null;
          const ms = span.ended_at !== null ? span.ended_at - span.started_at : null;

          return (
            <button
              key={span.span_id}
              onClick={() => onSelect(span.span_id)}
              className={`group w-full flex items-stretch text-left rounded-sm transition-colors ${
                isSelected ? 'bg-brandSoft ring-1 ring-brandBorder' : 'hover:bg-hover'
              }`}
            >
              <div
                className="shrink-0 px-3 h-9 flex items-center gap-2 overflow-hidden"
                style={{ width: NAME_COL_WIDTH }}
              >
                <span style={{ paddingLeft: depth * 14 }} aria-hidden />
                <KindBadge kind={span.kind} />
                <span className="truncate text-ink text-sm">{span.name}</span>
              </div>
              <div className="flex-1 relative h-9 px-1">
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-pill ${kindBarClass(
                    span.kind,
                  )} ${span.status === 'error' ? 'outline outline-1 outline-danger' : ''}`}
                  style={{
                    left: `${startOffset}%`,
                    width: `max(${widthPercent}%, 3px)`,
                    opacity: span.kind === 'agent.step' ? 0.55 : 0.95,
                  }}
                  title={`${formatDuration(ms)}${cost !== null ? ` · ${formatCost(cost)}` : ''}`}
                />
              </div>
              <div className="w-20 shrink-0 px-2 h-9 flex items-center justify-end text-ink2 font-mono text-sm tabular">
                {formatDuration(ms)}
              </div>
              <div className="w-20 shrink-0 px-2 h-9 flex items-center justify-end text-ink2 font-mono text-sm tabular">
                {cost !== null ? formatCost(cost) : <span className="text-faint">—</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
