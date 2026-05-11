'use client';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

type Severity = 'info' | 'good' | 'bug' | 'finetune';

interface Annotation {
  id: string;
  trace_id: string;
  span_id: string | null;
  severity: Severity;
  body: string;
  created_at: number;
  updated_at: number;
}

const SEVERITY_META: Record<
  Severity,
  { label: string; Icon: LucideIcon; ring: string; chip: string }
> = {
  info: {
    label: 'Note',
    Icon: Bookmark,
    ring: 'border-divider',
    chip: 'bg-subtle text-ink2 border-divider',
  },
  good: {
    label: 'Good example',
    Icon: CheckCircle2,
    ring: 'border-successBorder',
    chip: 'bg-successSoft text-success border-successBorder',
  },
  bug: {
    label: 'Bug / regression',
    Icon: AlertTriangle,
    ring: 'border-dangerBorder',
    chip: 'bg-dangerSoft text-danger border-dangerBorder',
  },
  finetune: {
    label: 'For finetuning',
    Icon: Sparkles,
    ring: 'border-brandBorder',
    chip: 'bg-brandSoft text-brand border-brandBorder',
  },
};

export function AnnotationsPanel({
  traceId,
  selectedSpanId,
}: {
  traceId: string;
  selectedSpanId: string | null;
}) {
  const [items, setItems] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [severity, setSeverity] = useState<Severity>('info');
  const [scope, setScope] = useState<'trace' | 'span'>('trace');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch(`/api/annotations?trace_id=${encodeURIComponent(traceId)}`, {
        cache: 'no-store',
      });
      const j = (await r.json()) as { annotations?: Annotation[] };
      setItems(j.annotations ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [traceId]);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const r = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trace_id: traceId,
          span_id: scope === 'span' ? selectedSpanId : null,
          severity,
          body,
        }),
      });
      const j = (await r.json()) as { annotation?: Annotation; error?: string };
      if (j.annotation) {
        setItems((prev) => [...prev, j.annotation as Annotation]);
        setDraft('');
      } else {
        setError(j.error ?? 'failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this annotation?')) return;
    await fetch(`/api/annotations/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink3 font-medium">Severity</span>
          {(Object.keys(SEVERITY_META) as Severity[]).map((s) => {
            const m = SEVERITY_META[s];
            const active = severity === s;
            return (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-pill text-2xs font-medium border transition-colors ${
                  active
                    ? m.chip
                    : 'bg-surface border-border text-ink3 hover:text-ink hover:bg-hover'
                }`}
              >
                <m.Icon size={11} strokeWidth={2} />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-ink3">
          <span className="font-medium">Attach to</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={scope === 'trace'}
              onChange={() => setScope('trace')}
              className="accent-brand"
            />
            <span>Whole trace</span>
          </label>
          <label
            className={`inline-flex items-center gap-1.5 ${
              selectedSpanId ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
            }`}
            title={selectedSpanId ? '' : 'Select a span in the graph or timeline first'}
          >
            <input
              type="radio"
              checked={scope === 'span'}
              onChange={() => selectedSpanId && setScope('span')}
              className="accent-brand"
              disabled={!selectedSpanId}
            />
            <span>Selected span{selectedSpanId ? '' : ' (none)'}</span>
          </label>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What did you notice? (e.g. 'Hallucinated the second tool result — useful as a negative example')"
          rows={3}
          className="w-full bg-surface border border-border rounded-md text-sm p-2.5 focus:border-brand focus:border-2 outline-none transition-colors resize-y placeholder:text-ink3"
        />
        {error && <div className="text-xs text-danger font-mono">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={submit}
            disabled={posting || !draft.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-50"
          >
            {posting ? (
              <Loader2 size={12} className="animate-spin" strokeWidth={2} />
            ) : (
              <MessageSquarePlus size={12} strokeWidth={2} />
            )}
            Add note
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-ink3 font-mono p-3">loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-ink3 p-6 text-center">
          No annotations yet. Add one above to mark this trace for future reference.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const m = SEVERITY_META[a.severity];
            return (
              <li
                key={a.id}
                className={`card border-l-[3px] ${m.ring} p-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-pill text-2xs font-medium border ${m.chip}`}
                    >
                      <m.Icon size={10} strokeWidth={2} />
                      {m.label}
                    </span>
                    <span className="text-2xs font-mono text-ink3">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                    {a.span_id && (
                      <span className="text-2xs font-mono text-ink3">
                        · span {a.span_id.slice(0, 12)}…
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(a.id)}
                    className="text-ink3 hover:text-danger transition-colors shrink-0"
                    aria-label="Delete"
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                  </button>
                </div>
                <div className="text-sm text-ink mt-2 whitespace-pre-wrap break-words">
                  {a.body}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
