'use client';
import { useEffect, useMemo, useState } from 'react';
import type { WyrdBlobRef, WyrdSpan } from '@/lib/types';
import { CopyButton } from './CopyButton';
import { KindBadge } from './KindBadge';
import { StatusBadge } from './StatusBadge';
import { ToolReproduce } from './ToolReproduce';
import { WebSearchView } from './WebSearchView';
import { formatCost, formatDuration, shortId } from '@/lib/format';

async function fetchBlob(hash: string): Promise<unknown> {
  const r = await fetch(`/api/blobs/${hash}`, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`blob ${hash}: ${r.status}`);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function BlobPane({ refRef, role }: { refRef: WyrdBlobRef; role: string }) {
  const [data, setData] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pretty, setPretty] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErr(null);
    fetchBlob(refRef.hash).then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [refRef.hash]);

  const text = useMemo(() => {
    if (data === null) return '';
    if (pretty) return asString(data);
    return typeof data === 'string' ? data : JSON.stringify(data);
  }, [data, pretty]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-mono text-ink3 truncate">
          <span className="text-ink2">{role}</span>
          <span className="mx-1.5 text-faint">·</span>
          <span>{shortId(refRef.hash, 12)}</span>
          <span className="mx-1.5 text-faint">·</span>
          <span>{refRef.size}b</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPretty((p) => !p)}
            className="h-7 px-2.5 text-xs font-medium rounded-pill border border-border bg-surface hover:bg-hover text-ink2 hover:text-ink transition-colors"
          >
            {pretty ? 'Raw' : 'Pretty'}
          </button>
          <CopyButton value={text} variant="outline" />
        </div>
      </div>
      {err && <div className="text-xs text-danger font-mono mb-2">{err}</div>}
      {data === null && !err ? (
        <div className="h-24 rounded-md shimmer bg-subtle" />
      ) : (
        <pre className="bg-subtle border border-divider rounded-md p-3 max-h-[440px] overflow-auto text-sm font-mono text-ink leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  );
}

function AttributesView({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <div className="text-xs text-ink3 font-mono">none</div>;
  return (
    <dl className="divide-y divide-divider">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-2 text-sm">
          <dt className="text-ink3 font-mono text-xs truncate" title={k}>
            {k}
          </dt>
          <dd className="text-ink font-mono text-sm tabular break-words">
            {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
              ? String(v)
              : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface InspectorTab {
  id: string;
  label: string;
  render: () => React.ReactNode;
}

function tabsForSpan(span: WyrdSpan): InspectorTab[] {
  const refs = span.refs ?? {};
  const tabs: InspectorTab[] = [
    {
      id: 'attrs',
      label: 'Attributes',
      render: () => <AttributesView attributes={span.attributes as Record<string, unknown>} />,
    },
  ];
  if (span.kind === 'llm.call') {
    if (refs.request)
      tabs.push({
        id: 'request',
        label: 'Request',
        render: () => <BlobPane refRef={refs.request!} role="request" />,
      });
    if (refs.response)
      tabs.push({
        id: 'response',
        label: 'Response',
        render: () => <BlobPane refRef={refs.response!} role="response" />,
      });
  } else if (span.kind === 'tool.call' || span.kind === 'tool.result') {
    const toolName =
      typeof span.attributes['tool.name'] === 'string'
        ? (span.attributes['tool.name'] as string)
        : span.name;
    // Custom renderers for known tools. Surface a meaningful "Search" view
    // for Anthropic server-side web_search instead of raw JSON.
    if (toolName === 'anthropic.web_search') {
      tabs.unshift({
        id: 'search',
        label: 'Search',
        render: () => (
          <WebSearchView
            argsRef={refs.tool_args ?? null}
            resultRef={refs.tool_result ?? null}
          />
        ),
      });
    }
    if (refs.tool_args)
      tabs.push({
        id: 'args',
        label: 'Arguments',
        render: () => <BlobPane refRef={refs.tool_args!} role="tool_args" />,
      });
    if (refs.tool_result)
      tabs.push({
        id: 'result',
        label: 'Result',
        render: () => <BlobPane refRef={refs.tool_result!} role="tool_result" />,
      });
    if (span.kind === 'tool.call') {
      tabs.push({
        id: 'reproduce',
        label: 'Determinism',
        render: () => <ToolReproduce traceId={span.trace_id} spanId={span.span_id} />,
      });
    }
  }
  return tabs;
}

export function Inspector({ span }: { span: WyrdSpan | null }) {
  const tabs = useMemo(() => (span ? tabsForSpan(span) : []), [span]);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? 'attrs');

  useEffect(() => {
    if (tabs.length && !tabs.find((t) => t.id === activeTab)) {
      setActiveTab(tabs[0]!.id);
    }
  }, [tabs, activeTab]);

  if (!span) {
    return (
      <div className="card sticky top-[110px] max-h-[calc(100vh-130px)] flex items-center justify-center shadow-e1">
        <div className="p-6 text-center max-w-[260px]">
          <div className="text-sm text-ink2 font-medium">No span selected</div>
          <p className="text-xs text-ink3 mt-2 leading-relaxed">
            Click any row in the timeline or any node in the graph to inspect its details.
          </p>
        </div>
      </div>
    );
  }

  const cost =
    typeof span.attributes['gen_ai.usage.cost_usd'] === 'number'
      ? (span.attributes['gen_ai.usage.cost_usd'] as number)
      : null;
  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="card sticky top-[110px] max-h-[calc(100vh-130px)] overflow-hidden flex flex-col shadow-e1">
      <div className="px-4 py-3 border-b border-border bg-elevated">
        <div className="flex items-center gap-2 mb-2">
          <KindBadge kind={span.kind} />
          <StatusBadge status={span.status} size="sm" />
          <div className="ml-auto">
            <CopyButton value={span.span_id} label="Span ID" variant="outline" />
          </div>
        </div>
        <h3 className="text-base font-medium text-ink leading-snug break-words">{span.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-ink3 mt-2">
          <span title={span.span_id}>{shortId(span.span_id, 14)}</span>
          {span.parent_span_id && (
            <>
              <span className="text-faint">·</span>
              <span>parent {shortId(span.parent_span_id, 8)}</span>
            </>
          )}
          <span className="text-faint">·</span>
          <span className="text-ink2 tabular">
            {formatDuration(span.ended_at !== null ? span.ended_at - span.started_at : null)}
          </span>
          {cost !== null && (
            <>
              <span className="text-faint">·</span>
              <span className="text-ink2 tabular">{formatCost(cost)}</span>
            </>
          )}
        </div>
      </div>

      <div className="border-b border-border flex items-center px-2 overflow-x-auto bg-surface">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === t.id ? 'text-brand' : 'text-ink3 hover:text-ink2'
            }`}
          >
            {t.label}
            {activeTab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-y-auto flex-1">{current?.render()}</div>
    </div>
  );
}
