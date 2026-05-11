'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ChevronRight, Pause, Play, Sparkles, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { formatCost, formatDuration, formatNumber, formatTimeShort, shortId } from '@/lib/format';
import type { TraceListItem } from '@/lib/types';

type Status = TraceListItem['status'];

interface ApiPayload {
  traces: TraceListItem[];
  error?: string;
}

const DEFAULT_POLL_MS = 500;

const KIND_GLYPH: Record<NonNullable<TraceListItem['last_activity_kind']>, LucideIcon> = {
  'agent.step': Sparkles,
  'llm.call': Zap,
  'tool.call': Wrench,
  'tool.result': Wrench,
};

export function LiveActivity({ initial, pollMs = DEFAULT_POLL_MS }: { initial: TraceListItem[]; pollMs?: number }) {
  const [traces, setTraces] = useState<TraceListItem[]>(initial);
  const [now, setNow] = useState<number>(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [lastTick, setLastTick] = useState<number>(() => Date.now());
  const prevById = useRef<Map<string, { cost: number; input: number; output: number; tickAt: number }>>(new Map());

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const r = await fetch('/api/traces?status=running', { cache: 'no-store' });
        const json = (await r.json()) as ApiPayload;
        if (cancelled) return;
        const next = json.traces ?? [];
        const now = Date.now();
        // Track per-trace deltas so we can flash on change.
        for (const t of next) {
          const prev = prevById.current.get(t.trace_id);
          const changed =
            !prev ||
            prev.cost !== t.cost_usd ||
            prev.input !== t.input_tokens ||
            prev.output !== t.output_tokens;
          if (changed) {
            prevById.current.set(t.trace_id, {
              cost: t.cost_usd,
              input: t.input_tokens,
              output: t.output_tokens,
              tickAt: now,
            });
          }
        }
        setTraces(next);
        setLastTick(now);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      }
    }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paused, pollMs]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  const running = useMemo(() => traces.filter((t) => t.status === ('running' as Status)), [traces]);
  const totalCost = running.reduce((a, t) => a + t.cost_usd, 0);
  const totalIn = running.reduce((a, t) => a + t.input_tokens, 0);
  const totalOut = running.reduce((a, t) => a + t.output_tokens, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 card px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex items-center justify-center w-2.5 h-2.5">
              <span
                className={`absolute inset-0 rounded-full ${
                  paused ? 'bg-warning' : 'bg-success'
                } ${paused ? '' : 'live-dot'}`}
              />
            </span>
            <span className="text-sm text-ink font-medium">{paused ? 'Paused' : 'Live'}</span>
          </div>
          <span className="text-xs text-ink3 font-mono tabular">
            polling every {pollMs}ms · last update{' '}
            {Math.max(0, Math.round((now - lastTick) / 100) / 10).toFixed(1)}s ago
          </span>
          {running.length > 0 && (
            <span className="text-xs text-ink3 font-mono tabular hidden md:inline-flex items-center gap-3 pl-3 border-l border-divider">
              <span>{running.length} running</span>
              <span>·</span>
              <span>
                {formatNumber(totalIn)}↓ {formatNumber(totalOut)}↑
              </span>
              <span>·</span>
              <span>{formatCost(totalCost)}</span>
            </span>
          )}
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
        >
          {paused ? <Play size={14} strokeWidth={1.75} /> : <Pause size={14} strokeWidth={1.75} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {err && (
        <div className="card border-dangerBorder bg-dangerSoft text-danger p-3 text-sm font-mono">
          {err}
        </div>
      )}

      {running.length === 0 ? (
        <div className="card max-w-2xl mx-auto p-10 text-center mt-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-brandSoft border border-brandBorder text-brand mb-4">
            <Activity size={22} strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-medium text-ink mb-2">No agents currently running</h2>
          <p className="text-sm text-ink3 max-w-md mx-auto">
            In-flight traces appear here while an instrumented agent is mid-execution.
            Start a run with{' '}
            <code className="font-mono text-ink2 bg-subtle border border-divider rounded-sm px-1.5 py-0.5">
              WYRD_ENABLED=1
            </code>{' '}
            and this page will light up.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {running.map((t) => {
            const elapsed = now - t.started_at;
            const Icon = t.last_activity_kind ? KIND_GLYPH[t.last_activity_kind] : Activity;
            const flashUntil = (prevById.current.get(t.trace_id)?.tickAt ?? 0) + 600;
            const flashing = now < flashUntil;
            return (
              <Link
                key={t.trace_id}
                href={`/trace/${t.trace_id}`}
                className={`card flex items-center gap-4 px-4 py-3 hover:border-brand hover:bg-elevated transition-colors group ${
                  flashing ? 'border-brand/40' : ''
                }`}
              >
                <span className="relative flex items-center justify-center w-2.5 h-2.5">
                  <span className="absolute inset-0 rounded-full bg-success live-dot" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-brand">{shortId(t.trace_id, 24)}</span>
                    <span className="text-2xs text-ink3 font-mono">
                      {t.agent_id}
                      {t.agent_version ? ` v${t.agent_version}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-ink3 font-mono tabular mt-1">
                    <span>started {formatTimeShort(t.started_at)}</span>
                    <span className="text-faint">·</span>
                    <span className="text-ink2">{formatDuration(elapsed)} elapsed</span>
                    <span className="text-faint">·</span>
                    <span className="text-ink2">{t.span_count} spans</span>
                    {t.last_activity && (
                      <>
                        <span className="text-faint">·</span>
                        <span className="inline-flex items-center gap-1 text-brand">
                          <Icon size={12} strokeWidth={1.75} />
                          <span className="truncate max-w-[280px]">{t.last_activity}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-5 font-mono text-xs text-ink2 tabular">
                  <div className="text-right">
                    <div className="text-2xs text-ink3 uppercase tracking-wider">Tokens</div>
                    <div className={`${flashing ? 'text-brand' : ''} transition-colors`}>
                      {formatNumber(t.input_tokens)}↓ {formatNumber(t.output_tokens)}↑
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xs text-ink3 uppercase tracking-wider">Cost</div>
                    <div className={`${flashing ? 'text-brand' : 'text-ink'} transition-colors`}>
                      {t.cost_usd > 0 ? formatCost(t.cost_usd) : '—'}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  strokeWidth={1.75}
                  className="text-ink3 group-hover:text-ink transition-colors"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
