'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, GitCompare } from 'lucide-react';
import type { TraceListItem } from '@/lib/types';
import { formatCost, formatTimeShort, shortId } from '@/lib/format';

export function TraceListPicker({
  traces,
  a,
  b,
  compact = false,
}: {
  traces: TraceListItem[];
  a: string | null;
  b: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [selA, setSelA] = useState<string | null>(a);
  const [selB, setSelB] = useState<string | null>(b);

  function go() {
    if (!selA || !selB || selA === selB) return;
    router.push(`/diff?a=${encodeURIComponent(selA)}&b=${encodeURIComponent(selB)}`);
  }

  if (compact) {
    return (
      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
        <Picker
          label="A"
          value={selA}
          onChange={setSelA}
          traces={traces}
          excluded={selB}
        />
        <ArrowRight size={14} className="text-ink3" strokeWidth={1.75} />
        <Picker
          label="B"
          value={selB}
          onChange={setSelB}
          traces={traces}
          excluded={selA}
        />
        <button
          onClick={go}
          disabled={!selA || !selB || selA === selB}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-50"
        >
          <GitCompare size={12} strokeWidth={2} />
          Compare
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <PickerCard
        label="Base (A)"
        value={selA}
        onChange={setSelA}
        traces={traces}
        excluded={selB}
      />
      <PickerCard
        label="Comparison (B)"
        value={selB}
        onChange={setSelB}
        traces={traces}
        excluded={selA}
      />
      <button
        onClick={go}
        disabled={!selA || !selB || selA === selB}
        className="md:col-span-2 inline-flex items-center justify-center gap-2 h-10 px-5 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-50"
      >
        <GitCompare size={14} strokeWidth={2} />
        Compare these traces
      </button>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  traces,
  excluded,
}: {
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  traces: TraceListItem[];
  excluded: string | null;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-xs font-mono uppercase text-ink3">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 bg-surface border border-border rounded-sm text-sm font-mono text-ink2 focus:border-brand outline-none max-w-[280px]"
      >
        <option value="">— select —</option>
        {traces.map((t) => (
          <option key={t.trace_id} value={t.trace_id} disabled={t.trace_id === excluded}>
            {shortId(t.trace_id, 14)} · {t.agent_id} · {formatTimeShort(t.started_at)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PickerCard({
  label,
  value,
  onChange,
  traces,
  excluded,
}: {
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  traces: TraceListItem[];
  excluded: string | null;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return traces;
    return traces.filter(
      (t) =>
        t.trace_id.toLowerCase().includes(q) ||
        t.agent_id.toLowerCase().includes(q),
    );
  }, [traces, query]);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-divider bg-elevated">
        <div className="text-sm font-medium text-ink">{label}</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter trace id or agent"
          className="mt-2 w-full h-8 px-2 bg-surface border border-border rounded-sm text-sm focus:border-brand outline-none"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink3">No traces match.</div>
        ) : (
          <ul>
            {filtered.map((t) => {
              const active = t.trace_id === value;
              const disabled = t.trace_id === excluded;
              return (
                <li key={t.trace_id}>
                  <button
                    onClick={() => !disabled && onChange(t.trace_id)}
                    disabled={disabled}
                    className={`w-full text-left px-4 py-2 border-b border-divider last:border-b-0 flex items-center gap-3 transition-colors ${
                      active
                        ? 'bg-brandSoft'
                        : disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-hover'
                    }`}
                  >
                    <span className="font-mono text-xs text-brand truncate min-w-0 flex-1">
                      {shortId(t.trace_id, 22)}
                    </span>
                    <span className="text-xs text-ink2 truncate">{t.agent_id}</span>
                    <span className="text-2xs font-mono text-ink3 tabular shrink-0">
                      {formatTimeShort(t.started_at)}
                    </span>
                    <span className="text-2xs font-mono text-ink3 tabular shrink-0">
                      {formatCost(t.cost_usd)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
