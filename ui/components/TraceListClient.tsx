'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronRight, Filter, MessageSquare, Search } from 'lucide-react';
import type { TraceListItem } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { CopyButton } from './CopyButton';
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimeShort,
  shortId,
} from '@/lib/format';

type StatusFilter = 'all' | 'ok' | 'error' | 'running';
type SortKey = 'started_at' | 'duration_ms' | 'span_count' | 'cost_usd';
type SortDir = 'asc' | 'desc';

const COLS: Array<{ key: SortKey | null; label: string; align: 'left' | 'right'; width?: string }> = [
  { key: null, label: 'Status', align: 'left', width: '120px' },
  { key: null, label: 'Trace ID', align: 'left' },
  { key: null, label: 'Agent', align: 'left' },
  { key: 'started_at', label: 'Started', align: 'left' },
  { key: 'duration_ms', label: 'Duration', align: 'right' },
  { key: 'span_count', label: 'Spans', align: 'right' },
  { key: null, label: 'Tokens', align: 'right' },
  { key: 'cost_usd', label: 'Cost', align: 'right' },
];

export function TraceListClient({ initial }: { initial: TraceListItem[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = initial;
    if (statusFilter !== 'all') rows = rows.filter((t) => t.status === statusFilter);
    if (q) {
      rows = rows.filter(
        (t) =>
          t.trace_id.toLowerCase().includes(q) ||
          t.agent_id.toLowerCase().includes(q) ||
          (t.agent_version ?? '').toLowerCase().includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? -Infinity;
      const bv = (b[sortKey] as number | null) ?? -Infinity;
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
    return rows;
  }, [initial, query, statusFilter, sortKey, sortDir]);

  const counts = useMemo(
    () => ({
      all: initial.length,
      ok: initial.filter((t) => t.status === 'ok').length,
      error: initial.filter((t) => t.status === 'error').length,
      running: initial.filter((t) => t.status === 'running').length,
    }),
    [initial],
  );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  return (
    <div className="card overflow-hidden shadow-e1">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3 bg-surface">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by trace id, agent, version"
            className="w-full h-9 pl-9 pr-3 bg-surface border border-border rounded-sm text-sm placeholder:text-ink3 focus:border-brand focus:border-2 outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-ink3">
          <Filter size={14} strokeWidth={1.75} />
          <span>Status</span>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'ok', 'error', 'running'] as const).map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-sm font-medium transition-colors border ${
                  active
                    ? 'bg-brandSoft text-brandStrong border-brandBorder'
                    : 'bg-surface border-border text-ink2 hover:bg-hover'
                }`}
              >
                <span className="capitalize">{s}</span>
                <span className="text-2xs font-mono text-ink3 tabular">{counts[s]}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-xs text-ink3 tabular font-mono">
          {filtered.length === initial.length
            ? `${initial.length} ${initial.length === 1 ? 'trace' : 'traces'}`
            : `${filtered.length} of ${initial.length}`}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink3 border-b border-border bg-elevated">
              {COLS.map((c) => {
                const isActive = c.key && sortKey === c.key;
                const sortable = c.key !== null;
                return (
                  <th
                    key={c.label}
                    className={`font-medium px-4 h-10 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={c.width ? { width: c.width } : undefined}
                  >
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(c.key as SortKey)}
                        className={`inline-flex items-center gap-1 hover:text-ink transition-colors ${
                          isActive ? 'text-ink' : ''
                        }`}
                      >
                        {c.label}
                        {isActive &&
                          (sortDir === 'asc' ? (
                            <ArrowUp size={12} strokeWidth={2} />
                          ) : (
                            <ArrowDown size={12} strokeWidth={2} />
                          ))}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} className="p-10 text-center text-sm text-ink3">
                  No traces match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.trace_id}
                  className="group border-b border-divider last:border-b-0 hover:bg-hover transition-colors"
                >
                  <td className="px-4 py-2">
                    <StatusBadge status={t.status} size="sm" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/trace/${t.trace_id}`}
                        className="font-mono text-sm text-brand hover:underline underline-offset-2"
                      >
                        {shortId(t.trace_id, 20)}
                      </Link>
                      {(t.note_count ?? 0) > 0 && (
                        <span
                          title={`${t.note_count} annotation${t.note_count === 1 ? '' : 's'}`}
                          className="inline-flex items-center gap-0.5 text-2xs font-mono text-ink3 bg-subtle border border-divider rounded-pill px-1.5 h-[18px]"
                        >
                          <MessageSquare size={9} strokeWidth={2} />
                          {t.note_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-ink">{t.agent_id}</span>
                    {t.agent_version && (
                      <span className="ml-1.5 text-xs text-ink3 font-mono">
                        v{t.agent_version}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-ink3 font-mono text-sm tabular">
                    {formatTimeShort(t.started_at)}
                  </td>
                  <td className="px-4 py-2 text-right text-ink2 font-mono text-sm tabular">
                    {formatDuration(t.duration_ms)}
                  </td>
                  <td className="px-4 py-2 text-right text-ink2 font-mono text-sm tabular">
                    {t.span_count}
                  </td>
                  <td className="px-4 py-2 text-right text-ink2 font-mono text-sm tabular whitespace-nowrap">
                    {formatNumber(t.input_tokens)}
                    <span className="text-faint mx-0.5">↓</span>
                    {formatNumber(t.output_tokens)}
                    <span className="text-faint ml-0.5">↑</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm tabular">
                    {t.cost_usd > 0 ? (
                      <span className="text-ink">{formatCost(t.cost_usd)}</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton value={t.trace_id} variant="ghost" />
                      </span>
                      <Link
                        href={`/trace/${t.trace_id}`}
                        className="text-ink3 hover:text-ink transition-colors"
                        aria-label="Open trace"
                      >
                        <ChevronRight size={18} strokeWidth={1.75} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
