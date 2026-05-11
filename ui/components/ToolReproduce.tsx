'use client';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Play } from 'lucide-react';

interface ReplayResult {
  ok: boolean;
  tool_name?: string;
  cached_args?: unknown;
  cached_result?: unknown;
  cache_key?: string;
  recomputed_key?: string;
  deterministic?: boolean;
  safe_to_replay?: boolean;
  error?: string;
}

export function ToolReproduce({ traceId, spanId }: { traceId: string; spanId: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch(`/api/replay/tool/${traceId}/${spanId}`, { method: 'POST' });
      const j = (await r.json()) as ReplayResult;
      setResult(j);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-md border border-divider bg-elevated p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Reproduce this tool call</div>
          <p className="text-xs text-ink3 mt-1">
            Replays from the cached args. Verifies the cache key still matches — proves the run was
            deterministic.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-60 shrink-0"
        >
          {running ? (
            <Loader2 size={14} className="animate-spin" strokeWidth={2} />
          ) : (
            <Play size={14} strokeWidth={2.5} fill="currentColor" />
          )}
          Reproduce
        </button>
      </div>
      {result && (
        <div className="mt-3 pt-3 border-t border-divider space-y-2 text-xs font-mono">
          {result.ok ? (
            <>
              <Row
                label="Tool"
                value={result.tool_name ?? '?'}
              />
              <Row
                label="Determinism"
                value={
                  <span className="inline-flex items-center gap-1">
                    {result.deterministic ? (
                      <>
                        <CheckCircle2 size={12} className="text-success" strokeWidth={2} />
                        <span className="text-success">cache key matches</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={12} className="text-warning" strokeWidth={2} />
                        <span className="text-warning">cache key drift</span>
                      </>
                    )}
                  </span>
                }
              />
              <Row
                label="Safe to replay"
                value={
                  <span className={result.safe_to_replay ? 'text-success' : 'text-warning'}>
                    {result.safe_to_replay ? 'yes (pure)' : 'no (side effects)'}
                  </span>
                }
              />
              {result.cache_key && (
                <Row label="Cache key" value={<span className="break-all">{result.cache_key.slice(0, 80)}{result.cache_key.length > 80 ? '…' : ''}</span>} />
              )}
            </>
          ) : (
            <div className="text-danger">{result.error ?? 'replay failed'}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-ink3">{label}</span>
      <span className="text-ink2 break-words">{value}</span>
    </div>
  );
}
