'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Minus, Plus } from 'lucide-react';
import type { DiffOp } from '@/lib/diff';
import { formatCost, formatDuration, formatNumber, shortId } from '@/lib/format';

interface SpanDiffRow {
  span_id: string;
  name: string;
  kind: string;
  status: 'a-only' | 'b-only' | 'matched' | 'changed';
  duration_a: number | null;
  duration_b: number | null;
  cost_a: number | null;
  cost_b: number | null;
  tokens_a: { in: number; out: number } | null;
  tokens_b: { in: number; out: number } | null;
}

interface TraceSummary {
  trace_id: string;
  agent_id: string;
  agent_version: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  span_count: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  llm_calls: number;
  tool_calls: number;
}

interface DiffPayload {
  a: TraceSummary;
  b: TraceSummary;
  spans: SpanDiffRow[];
  response_diff: DiffOp[];
}

export function DiffViewer({ a, b }: { a: string; b: string }) {
  const [payload, setPayload] = useState<DiffPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPayload(null);
    setErr(null);
    fetch(`/api/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as DiffPayload & { error?: string };
        if (j.error) setErr(j.error);
        else setPayload(j);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [a, b]);

  if (err) {
    return (
      <div className="card border-dangerBorder bg-dangerSoft text-danger p-4 text-sm font-mono">
        {err}
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="card p-10 flex items-center justify-center gap-2 text-sm text-ink3">
        <Loader2 size={14} className="animate-spin" strokeWidth={1.75} /> computing diff…
      </div>
    );
  }

  const stats = [
    {
      label: 'Spans',
      a: payload.a.span_count,
      b: payload.b.span_count,
      format: (n: number) => n.toString(),
    },
    {
      label: 'LLM calls',
      a: payload.a.llm_calls,
      b: payload.b.llm_calls,
      format: (n: number) => n.toString(),
    },
    {
      label: 'Tool calls',
      a: payload.a.tool_calls,
      b: payload.b.tool_calls,
      format: (n: number) => n.toString(),
    },
    {
      label: 'Input tokens',
      a: payload.a.input_tokens,
      b: payload.b.input_tokens,
      format: formatNumber,
    },
    {
      label: 'Output tokens',
      a: payload.a.output_tokens,
      b: payload.b.output_tokens,
      format: formatNumber,
    },
    {
      label: 'Cost',
      a: payload.a.cost_usd,
      b: payload.b.cost_usd,
      format: formatCost,
    },
    {
      label: 'Duration',
      a: payload.a.ended_at !== null ? payload.a.ended_at - payload.a.started_at : null,
      b: payload.b.ended_at !== null ? payload.b.ended_at - payload.b.started_at : null,
      format: (n: number | null) => formatDuration(n),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TraceCard summary={payload.a} label="A" />
        <TraceCard summary={payload.b} label="B" />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-divider">
          <div className="text-base font-medium text-ink">Aggregate diff</div>
          <div className="text-sm text-ink3 mt-0.5">Delta = B − A</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
              <th className="text-left font-medium px-5 h-9">Metric</th>
              <th className="text-right font-medium px-5 h-9 w-32">A</th>
              <th className="text-right font-medium px-5 h-9 w-32">B</th>
              <th className="text-right font-medium px-5 h-9 w-32">Δ</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => {
              const delta = row.a !== null && row.b !== null ? (row.b as number) - (row.a as number) : null;
              const dir = delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
              return (
                <tr key={row.label} className="border-b border-divider last:border-b-0">
                  <td className="px-5 py-2 text-ink2">{row.label}</td>
                  <td className="px-5 py-2 text-right font-mono text-sm text-ink2 tabular">
                    {row.format(row.a as number)}
                  </td>
                  <td className="px-5 py-2 text-right font-mono text-sm text-ink tabular">
                    {row.format(row.b as number)}
                  </td>
                  <td
                    className={`px-5 py-2 text-right font-mono text-sm tabular inline-flex items-center justify-end gap-1 w-full ${
                      dir === 'up' ? 'text-warning' : dir === 'down' ? 'text-success' : 'text-ink3'
                    }`}
                  >
                    {delta === null ? (
                      '—'
                    ) : (
                      <>
                        {dir === 'up' && <ArrowUp size={11} strokeWidth={2} />}
                        {dir === 'down' && <ArrowDown size={11} strokeWidth={2} />}
                        {row.format(delta as number)}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-divider">
          <div className="text-base font-medium text-ink">Span-by-span</div>
          <div className="text-sm text-ink3 mt-0.5">
            Matched by (kind, name). Rows changed in cost/tokens/duration are flagged.
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
              <th className="text-left font-medium px-5 h-9 w-32">Status</th>
              <th className="text-left font-medium px-5 h-9">Span</th>
              <th className="text-right font-medium px-5 h-9 w-32">Dur · A → B</th>
              <th className="text-right font-medium px-5 h-9 w-32">Cost · A → B</th>
              <th className="text-right font-medium px-5 h-9 w-40">Tokens · A → B</th>
            </tr>
          </thead>
          <tbody>
            {payload.spans.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-sm text-ink3">
                  No spans on either side.
                </td>
              </tr>
            )}
            {payload.spans.map((r) => (
              <tr key={r.span_id} className="border-b border-divider last:border-b-0">
                <td className="px-5 py-2">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-5 py-2">
                  <div className="text-sm text-ink truncate">{r.name}</div>
                  <div className="text-2xs font-mono text-ink3">{r.kind}</div>
                </td>
                <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular whitespace-nowrap">
                  {formatDuration(r.duration_a)} → {formatDuration(r.duration_b)}
                </td>
                <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular whitespace-nowrap">
                  {r.cost_a !== null ? formatCost(r.cost_a) : '—'} →{' '}
                  {r.cost_b !== null ? formatCost(r.cost_b) : '—'}
                </td>
                <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular whitespace-nowrap">
                  {r.tokens_a ? `${r.tokens_a.in}↓ ${r.tokens_a.out}↑` : '—'} →{' '}
                  {r.tokens_b ? `${r.tokens_b.in}↓ ${r.tokens_b.out}↑` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-divider">
          <div className="text-base font-medium text-ink">Response text diff</div>
          <div className="text-sm text-ink3 mt-0.5">
            Concatenated text from all <code className="font-mono">llm.call</code> spans, left → right.
            <span className="text-success ml-3">green = added in B</span>
            <span className="text-danger ml-3">red = removed (was in A)</span>
          </div>
        </div>
        <div className="p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-ink2 max-h-[600px] overflow-auto">
          {payload.response_diff.length === 0 ? (
            <span className="text-ink3 italic">(no response text on either side)</span>
          ) : (
            payload.response_diff.map((op, i) => {
              if (op.kind === 'equal') return <span key={i}>{op.text}</span>;
              if (op.kind === 'ins')
                return (
                  <span key={i} className="bg-successSoft text-success">
                    {op.text}
                  </span>
                );
              return (
                <span key={i} className="bg-dangerSoft text-danger line-through">
                  {op.text}
                </span>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function TraceCard({ summary, label }: { summary: TraceSummary; label: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xs font-mono uppercase tracking-wider text-ink3 bg-subtle border border-divider rounded-pill px-2 py-0.5">
          {label}
        </span>
        <Link
          href={`/trace/${summary.trace_id}`}
          className="font-mono text-sm text-brand hover:underline truncate min-w-0 flex-1"
        >
          {shortId(summary.trace_id, 22)}
        </Link>
        <Link
          href={`/trace/${summary.trace_id}`}
          className="text-ink3 hover:text-ink"
          aria-label="Open trace"
        >
          <ExternalLink size={14} strokeWidth={1.75} />
        </Link>
      </div>
      <div className="text-xs font-mono text-ink3">
        {summary.agent_id}
        {summary.agent_version ? ` v${summary.agent_version}` : ''} · {summary.status}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: SpanDiffRow['status'] }) {
  const meta = {
    matched: { label: 'matched', cls: 'bg-subtle text-ink3 border-divider', Icon: null },
    changed: { label: 'changed', cls: 'bg-warningSoft text-warning border-warningBorder', Icon: null },
    'a-only': { label: 'only in A', cls: 'bg-dangerSoft text-danger border-dangerBorder', Icon: Minus },
    'b-only': { label: 'only in B', cls: 'bg-successSoft text-success border-successBorder', Icon: Plus },
  } as const;
  const m = meta[status];
  return (
    <span
      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-pill text-2xs font-medium border ${m.cls}`}
    >
      {m.Icon && <m.Icon size={10} strokeWidth={2} />}
      {m.label}
    </span>
  );
}
