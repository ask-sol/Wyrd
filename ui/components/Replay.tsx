'use client';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KindBadge, kindBarClass } from './KindBadge';
import { formatCost, formatDuration } from '@/lib/format';
import type { TraceDetailPayload, WyrdSpan } from '@/lib/types';

type BlobMap = Record<string, unknown>;

function useBlobLoader(hashes: string[]): { map: BlobMap; ready: boolean } {
  const key = useMemo(() => hashes.slice().sort().join(','), [hashes]);
  const [state, setState] = useState<{ map: BlobMap; ready: boolean }>({ map: {}, ready: false });
  useEffect(() => {
    let cancelled = false;
    setState({ map: {}, ready: false });
    (async () => {
      const out: BlobMap = {};
      await Promise.all(
        hashes.map(async (h) => {
          try {
            const r = await fetch(`/api/blobs/${h}`, { cache: 'force-cache' });
            if (!r.ok) return;
            const t = await r.text();
            try {
              out[h] = JSON.parse(t);
            } catch {
              out[h] = t;
            }
          } catch {}
        }),
      );
      if (!cancelled) setState({ map: out, ready: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

interface CardProps {
  span: WyrdSpan;
  startOffset: number;
  duration: number;
  elapsed: number;
  blobs: BlobMap;
}

function PlaybackCard({ span, startOffset, duration, elapsed, blobs }: CardProps) {
  const visible = elapsed >= startOffset;
  if (!visible) return null;
  const local = Math.max(0, elapsed - startOffset);
  const progress = duration === 0 ? 1 : Math.min(local / duration, 1);
  const active = progress < 1;
  const cost =
    typeof span.attributes['gen_ai.usage.cost_usd'] === 'number'
      ? (span.attributes['gen_ai.usage.cost_usd'] as number)
      : null;

  let body: React.ReactNode = null;
  if (span.kind === 'llm.call') {
    const resp = span.refs.response
      ? (blobs[span.refs.response.hash] as
          | { text?: string; tool_calls?: Array<{ name: string }> }
          | undefined)
      : undefined;
    const req = span.refs.request
      ? (blobs[span.refs.request.hash] as
          | { messages?: Array<{ role: string; content: unknown }> }
          | undefined)
      : undefined;
    const userMsg = req?.messages?.find((m) => m.role === 'user');
    const userText =
      userMsg && typeof userMsg.content === 'string'
        ? userMsg.content.length > 240
          ? userMsg.content.slice(0, 240) + '…'
          : userMsg.content
        : null;
    const fullText = resp?.text ?? '';
    const shown = active ? fullText.slice(0, Math.floor(fullText.length * progress)) : fullText;
    body = (
      <div className="space-y-2.5">
        {userText && (
          <div className="text-xs text-ink3">
            <span className="text-faint mr-1.5">user</span>
            {userText}
          </div>
        )}
        <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
          {shown}
          {active && fullText.length > 0 && (
            <span className="inline-block w-[1px] h-[1em] bg-brand align-middle animate-pulse ml-0.5" />
          )}
        </div>
        {!active && resp?.tool_calls && resp.tool_calls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {resp.tool_calls.map((tc, i) => (
              <span
                key={i}
                className="text-2xs font-mono px-1.5 py-0.5 bg-kToolSoft text-kTool rounded-sm border border-divider"
              >
                → {tc.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  } else if (span.kind === 'tool.call' || span.kind === 'tool.result') {
    const args = span.refs.tool_args ? blobs[span.refs.tool_args.hash] : undefined;
    const result = span.refs.tool_result
      ? (blobs[span.refs.tool_result.hash] as { output?: string; error?: string } | undefined)
      : undefined;
    const argString = args ? JSON.stringify(args) : '';
    body = (
      <div className="space-y-1.5 text-xs font-mono">
        {argString && (
          <div>
            <span className="text-faint">args </span>
            <code className="text-ink2 break-all">
              {argString.length > 220 ? argString.slice(0, 220) + '…' : argString}
            </code>
          </div>
        )}
        {!active && result && (
          <div className="animate-[fadeIn_0.25s_ease-out]">
            <span className="text-faint">result </span>
            {result.error ? (
              <code className="text-danger break-words">{result.error}</code>
            ) : (
              <code className="text-ink break-words whitespace-pre-wrap">
                {String(result.output ?? '').length > 320
                  ? String(result.output ?? '').slice(0, 320) + '…'
                  : String(result.output ?? '')}
              </code>
            )}
          </div>
        )}
        {active && (
          <div className="text-xs text-ink3 flex items-center gap-1.5 italic">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-kTool animate-pulse" />
            executing…
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <div className="text-xs text-ink3">
        {span.parent_span_id === null ? 'Root execution step' : 'Agent step'}
      </div>
    );
  }

  return (
    <div
      className={`relative bg-surface border rounded-md p-4 transition-all duration-200 ${
        active ? 'border-brand shadow-sm' : 'border-border'
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] rounded-l-md ${kindBarClass(span.kind)}`}
      />
      <div className="flex items-center gap-2 mb-2">
        <KindBadge kind={span.kind} />
        <span className="text-sm text-ink font-medium truncate">{span.name}</span>
        <div className="ml-auto flex items-center gap-3 text-xs font-mono text-ink3 tabular shrink-0">
          {cost !== null && <span className="text-ink2">{formatCost(cost)}</span>}
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
      {body}
      {active && (
        <div className="mt-3 h-0.5 bg-divider relative overflow-hidden rounded-full">
          <div
            className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-100 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

const SPEEDS = [1, 2, 5, 20] as const;
const TICK_MS = 50;

export function Replay({ payload }: { payload: TraceDetailPayload }) {
  const sorted = useMemo(
    () => [...payload.spans].sort((a, b) => a.started_at - b.started_at),
    [payload.spans],
  );
  const traceStart = payload.trace.started_at;
  const traceEnd =
    payload.trace.ended_at ??
    Math.max(...sorted.map((s) => s.ended_at ?? s.started_at), traceStart);
  const totalMs = Math.max(traceEnd - traceStart, 1);

  const allHashes = useMemo(() => {
    const out: string[] = [];
    for (const s of sorted) {
      for (const r of Object.values(s.refs ?? {})) if (r) out.push(r.hash);
    }
    return out;
  }, [sorted]);
  const { map: blobs, ready: blobsReady } = useBlobLoader(allHashes);

  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const speed = SPEEDS[speedIdx]!;
  const ticker = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (ticker.current !== null) {
        window.clearInterval(ticker.current);
        ticker.current = null;
      }
      return;
    }
    ticker.current = window.setInterval(() => {
      setElapsed((e) => {
        const next = e + TICK_MS * speed;
        if (next >= totalMs) {
          setPlaying(false);
          return totalMs;
        }
        return next;
      });
    }, TICK_MS);
    return () => {
      if (ticker.current !== null) {
        window.clearInterval(ticker.current);
        ticker.current = null;
      }
    };
  }, [playing, speed, totalMs]);

  const finished = elapsed >= totalMs;
  const progress = Math.min(elapsed / totalMs, 1);
  const restart = () => {
    setElapsed(0);
    setPlaying(true);
  };
  const togglePlay = () => (finished ? restart() : setPlaying((p) => !p));
  const skipToEnd = () => {
    setElapsed(totalMs);
    setPlaying(false);
  };

  // Running totals up to elapsed
  let runCost = 0,
    runIn = 0,
    runOut = 0,
    runSpans = 0;
  const leafSpans = useMemo(
    () => sorted.filter((s) => s.kind !== 'agent.step' || s.parent_span_id === null),
    [sorted],
  );
  for (const s of leafSpans) {
    if (elapsed >= s.started_at - traceStart) {
      runSpans++;
      const c = s.attributes['gen_ai.usage.cost_usd'];
      const i = s.attributes['gen_ai.usage.input_tokens'];
      const o = s.attributes['gen_ai.usage.output_tokens'];
      if (typeof c === 'number') runCost += c;
      if (typeof i === 'number') runIn += i;
      if (typeof o === 'number') runOut += o;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
        <button
          onClick={togglePlay}
          className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-brand hover:bg-brandStrong text-white transition-colors"
          aria-label={playing ? 'Pause' : finished ? 'Restart' : 'Play'}
        >
          {playing ? (
            <Pause size={14} strokeWidth={2.5} fill="currentColor" />
          ) : finished ? (
            <RotateCcw size={14} strokeWidth={2} />
          ) : (
            <Play size={14} strokeWidth={2.5} fill="currentColor" />
          )}
        </button>
        <button
          onClick={skipToEnd}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface hover:border-borderHi text-sm text-ink2 hover:text-ink transition-colors"
        >
          <SkipForward size={13} strokeWidth={1.75} />
          Skip
        </button>
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          {SPEEDS.map((s, i) => (
            <button
              key={s}
              onClick={() => setSpeedIdx(i)}
              className={`h-9 px-2.5 text-xs font-medium font-mono transition-colors ${
                speedIdx === i ? 'bg-elevated text-ink' : 'bg-surface text-ink3 hover:text-ink'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="relative h-1.5 bg-divider rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-brand transition-[width] duration-75 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
        <div className="text-xs font-mono text-ink2 tabular whitespace-nowrap">
          {formatDuration(Math.round(elapsed))}{' '}
          <span className="text-faint">/ {formatDuration(totalMs)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-ink3">
          <span className="font-medium text-ink2 tabular font-mono">{runSpans}</span> of{' '}
          <span className="font-mono">{leafSpans.length}</span> events
        </span>
        <span className="text-ink3">
          cost{' '}
          <span className="font-medium text-ink2 tabular font-mono">{formatCost(runCost)}</span>
        </span>
        <span className="text-ink3">
          tokens{' '}
          <span className="font-medium text-ink2 tabular font-mono">
            {runIn.toLocaleString()}↓ {runOut.toLocaleString()}↑
          </span>
        </span>
        {!blobsReady && <span className="text-faint italic">loading payloads…</span>}
        <span className="ml-auto text-faint font-mono">
          {payload.trace.agent_id}
          {payload.trace.agent_version ? ` v${payload.trace.agent_version}` : ''}
        </span>
      </div>

      <div className="space-y-2">
        {leafSpans.map((s) => (
          <PlaybackCard
            key={s.span_id}
            span={s}
            startOffset={s.started_at - traceStart}
            duration={(s.ended_at ?? s.started_at) - s.started_at}
            elapsed={elapsed}
            blobs={blobs}
          />
        ))}
      </div>
    </div>
  );
}
