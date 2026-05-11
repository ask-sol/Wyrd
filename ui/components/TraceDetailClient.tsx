'use client';
import { useEffect, useState } from 'react';
import { Code2, Play } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { Dag } from './Dag';
import { Inspector } from './Inspector';
import { KpiCard } from './KpiCard';
import { PageHeader } from './PageHeader';
import { AnnotationsPanel } from './AnnotationsPanel';
import { ExportBundleButton } from './BundleActions';
import { Replay } from './Replay';
import { SecurityPanel } from './SecurityPanel';
import { SegmentedControl } from './SegmentedControl';
import { StatusBadge } from './StatusBadge';
import { Timeline } from './Timeline';
import { VirtualNodeInspector } from './VirtualNodeInspector';
import { formatCost, formatDuration, formatNumber, formatTimeShort } from '@/lib/format';
import type { VirtualNode } from '@/lib/expandTrace';
import type { TraceDetailPayload } from '@/lib/types';

type ViewMode = 'timeline' | 'graph' | 'replay' | 'security' | 'notes';

export function TraceDetailClient({ payload }: { payload: TraceDetailPayload }) {
  const [mode, setMode] = useState<ViewMode>('graph');
  const [selectedId, setSelectedId] = useState<string | null>(payload.trace.root_span_id);
  const [virtuals, setVirtuals] = useState<VirtualNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/traces/${payload.trace.trace_id}/expanded`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as { virtual_nodes?: VirtualNode[] };
        if (!cancelled && j.virtual_nodes) setVirtuals(j.virtual_nodes);
      })
      .catch(() => {/* tolerate */});
    return () => {
      cancelled = true;
    };
  }, [payload.trace.trace_id]);

  const selected = payload.spans.find((s) => s.span_id === selectedId) ?? null;
  const selectedVirtual = !selected
    ? virtuals.find((v) => v.id === selectedId) ?? null
    : null;
  const duration =
    payload.trace.ended_at !== null ? payload.trace.ended_at - payload.trace.started_at : null;

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <PageHeader
        title={
          <div className="flex items-center flex-wrap gap-3">
            <span className="font-mono text-2xl text-ink break-all">
              {payload.trace.trace_id}
            </span>
            <StatusBadge status={payload.trace.status} />
          </div>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-ink2">
              {payload.trace.agent_id}
              {payload.trace.agent_version && (
                <span className="ml-1.5 font-mono text-xs text-ink3">
                  v{payload.trace.agent_version}
                </span>
              )}
            </span>
            <span className="text-faint">·</span>
            <span className="font-mono text-xs text-ink3 tabular">
              {formatTimeShort(payload.trace.started_at)}
            </span>
            <span className="text-faint">·</span>
            <span className="font-mono text-xs text-ink3 tabular">
              {formatDuration(duration)}
            </span>
          </span>
        }
        actions={
          <>
            <CopyButton value={payload.trace.trace_id} label="Trace ID" variant="outline" />
            <a
              href={`/api/traces/${payload.trace.trace_id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
            >
              <Code2 size={14} strokeWidth={1.75} />
              JSON
            </a>
            <ExportBundleButton traceId={payload.trace.trace_id} />
            <button
              onClick={() => setMode('replay')}
              disabled={payload.trace.status === 'running'}
              title={payload.trace.status === 'running' ? 'Trace is still in flight' : 'Step through the trace'}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-pill bg-brand hover:bg-brandStrong text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={14} strokeWidth={2.5} fill="currentColor" />
              Reproduce
            </button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Duration" value={formatDuration(duration)} />
        <KpiCard
          label="Spans"
          value={
            virtuals.length > 0
              ? `${payload.spans.length} · ${virtuals.length} deep`
              : payload.spans.length.toString()
          }
        />
        <KpiCard
          label="LLM calls"
          value={payload.rollup.llm_calls.toString()}
          accent="brand"
        />
        <KpiCard label="Tool calls" value={payload.rollup.tool_calls.toString()} />
        <KpiCard
          label="Tokens"
          value={`${formatNumber(payload.rollup.total_input_tokens)}↓ ${formatNumber(
            payload.rollup.total_output_tokens,
          )}↑`}
        />
        <KpiCard
          label="Cost"
          value={
            payload.rollup.total_cost_usd > 0 ? formatCost(payload.rollup.total_cost_usd) : '—'
          }
          accent={payload.rollup.total_cost_usd > 0 ? 'default' : 'muted'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6 items-start">
        <div className="card overflow-hidden shadow-e1">
          <div className="border-b border-border flex items-center justify-between px-3 py-2 bg-elevated">
            <SegmentedControl<ViewMode>
              value={mode}
              onChange={setMode}
              segments={[
                { id: 'timeline', label: 'Timeline' },
                { id: 'graph', label: 'Graph' },
                { id: 'replay', label: 'Replay' },
                { id: 'security', label: 'Security' },
                { id: 'notes', label: 'Notes' },
              ]}
            />
            <div className="text-xs font-mono text-ink3 tabular">
              {payload.spans.length} {payload.spans.length === 1 ? 'span' : 'spans'}
            </div>
          </div>
          <div className="p-4">
            {mode === 'timeline' && (
              <Timeline spans={payload.spans} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {mode === 'graph' && (
              <Dag
                spans={payload.spans}
                selectedId={selectedId}
                onSelect={setSelectedId}
                traceId={payload.trace.trace_id}
              />
            )}
            {mode === 'replay' && <Replay payload={payload} />}
            {mode === 'security' && <SecurityPanel traceId={payload.trace.trace_id} />}
            {mode === 'notes' && (
              <AnnotationsPanel traceId={payload.trace.trace_id} selectedSpanId={selectedId} />
            )}
          </div>
        </div>

        {selectedVirtual ? (
          <VirtualNodeInspector node={selectedVirtual} />
        ) : (
          <Inspector span={selected} />
        )}
      </div>
    </div>
  );
}
