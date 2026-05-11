import { join } from 'node:path';
import { getRootDir } from './store';

export type Bucket = 'hour' | 'day';
export type Range = '24h' | '7d' | '30d' | 'all';

export interface TrendsRow {
  bucket_start_ms: number;
  trace_count: number;
  ok_count: number;
  error_count: number;
  llm_calls: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  p50_duration_ms: number | null;
  p95_duration_ms: number | null;
}

export interface ModelBreakdown {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface ToolBreakdown {
  tool_name: string;
  side: 'client' | 'server' | 'unknown';
  calls: number;
  errors: number;
  avg_duration_ms: number | null;
}

export interface TrendsSummary {
  range: Range;
  bucket: Bucket;
  buckets: TrendsRow[];
  by_model: ModelBreakdown[];
  by_tool: ToolBreakdown[];
  totals: {
    trace_count: number;
    ok_count: number;
    error_count: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    llm_calls: number;
    tool_calls: number;
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function dbPath(): string {
  return join(getRootDir(), 'traces.sqlite3');
}

function bucketStart(ms: number, bucket: Bucket): number {
  const d = new Date(ms);
  if (bucket === 'hour') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function rangeMs(range: Range): number | null {
  const day = 86_400_000;
  switch (range) {
    case '24h':
      return Date.now() - day;
    case '7d':
      return Date.now() - 7 * day;
    case '30d':
      return Date.now() - 30 * day;
    case 'all':
      return null;
  }
}

export async function getTrends(range: Range = '7d'): Promise<TrendsSummary> {
  const bucket: Bucket = range === '24h' ? 'hour' : 'day';
  const since = rangeMs(range);
  const empty: TrendsSummary = {
    range,
    bucket,
    buckets: [],
    by_model: [],
    by_tool: [],
    totals: {
      trace_count: 0,
      ok_count: 0,
      error_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      llm_calls: 0,
      tool_calls: 0,
    },
  };

  let Database: typeof import('better-sqlite3');
  try {
    Database = (await import('better-sqlite3')).default;
  } catch {
    return empty;
  }
  let db: import('better-sqlite3').Database;
  try {
    db = new Database(dbPath(), { readonly: true, fileMustExist: true });
  } catch {
    return empty;
  }
  db.pragma('busy_timeout = 2000');

  try {
    const whereTrace = since !== null ? 'WHERE t.started_at >= ?' : '';

    const traces = db
      .prepare(
        `SELECT t.trace_id, t.started_at, t.ended_at, t.status
         FROM traces t
         ${whereTrace}
         ORDER BY t.started_at ASC`,
      )
      .all(...(since !== null ? [since] : [])) as Array<{
      trace_id: string;
      started_at: number;
      ended_at: number | null;
      status: 'ok' | 'error' | 'running';
    }>;

    const spans = db
      .prepare(
        `SELECT s.trace_id, s.kind, s.status,
                s.started_at, s.ended_at,
                s.attributes
         FROM spans s
         JOIN traces t ON t.trace_id = s.trace_id
         ${whereTrace ? whereTrace.replace('WHERE', 'WHERE') : ''}
         ${whereTrace ? '' : ''}`.replace(/\s+$/g, '') + (since !== null && !whereTrace ? '' : ''),
      )
      .all(...(since !== null ? [since] : [])) as Array<{
      trace_id: string;
      kind: 'agent.step' | 'llm.call' | 'tool.call' | 'tool.result';
      status: string;
      started_at: number;
      ended_at: number | null;
      attributes: string;
    }>;

    const spansByTrace = new Map<string, typeof spans>();
    for (const s of spans) {
      const arr = spansByTrace.get(s.trace_id) ?? [];
      arr.push(s);
      spansByTrace.set(s.trace_id, arr);
    }

    const bucketsMap = new Map<number, TrendsRow & { durations: number[] }>();
    const totals = { ...empty.totals };

    function bucketRowFor(ts: number) {
      const start = bucketStart(ts, bucket);
      let row = bucketsMap.get(start);
      if (!row) {
        row = {
          bucket_start_ms: start,
          trace_count: 0,
          ok_count: 0,
          error_count: 0,
          llm_calls: 0,
          tool_calls: 0,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          p50_duration_ms: null,
          p95_duration_ms: null,
          durations: [],
        };
        bucketsMap.set(start, row);
      }
      return row;
    }

    for (const t of traces) {
      const row = bucketRowFor(t.started_at);
      row.trace_count += 1;
      totals.trace_count += 1;
      if (t.status === 'ok') {
        row.ok_count += 1;
        totals.ok_count += 1;
      } else if (t.status === 'error') {
        row.error_count += 1;
        totals.error_count += 1;
      }
      if (t.ended_at !== null) {
        row.durations.push(t.ended_at - t.started_at);
      }
      const ts = spansByTrace.get(t.trace_id) ?? [];
      for (const sp of ts) {
        if (sp.kind === 'llm.call') {
          row.llm_calls += 1;
          totals.llm_calls += 1;
          try {
            const a = JSON.parse(sp.attributes ?? '{}') as Record<string, unknown>;
            const inT = Number(a['gen_ai.usage.input_tokens'] ?? 0);
            const outT = Number(a['gen_ai.usage.output_tokens'] ?? 0);
            const cost = Number(a['gen_ai.usage.cost_usd'] ?? 0);
            if (Number.isFinite(inT)) {
              row.input_tokens += inT;
              totals.input_tokens += inT;
            }
            if (Number.isFinite(outT)) {
              row.output_tokens += outT;
              totals.output_tokens += outT;
            }
            if (Number.isFinite(cost)) {
              row.cost_usd += cost;
              totals.cost_usd += cost;
            }
          } catch {
            /* ignore */
          }
        } else if (sp.kind === 'tool.call') {
          row.tool_calls += 1;
          totals.tool_calls += 1;
        }
      }
    }

    // Fill in zero-buckets across the requested window so the chart shows
    // continuity (e.g. "5 days of nothing, then today spiked").
    const windowEnd = Date.now();
    const windowStart = since ?? (traces.length > 0 ? traces[0]!.started_at : windowEnd);
    const step = bucket === 'hour' ? 3600_000 : 86_400_000;
    for (
      let t = bucketStart(windowStart, bucket);
      t <= bucketStart(windowEnd, bucket);
      t += step
    ) {
      if (!bucketsMap.has(t)) {
        bucketsMap.set(t, {
          bucket_start_ms: t,
          trace_count: 0,
          ok_count: 0,
          error_count: 0,
          llm_calls: 0,
          tool_calls: 0,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          p50_duration_ms: null,
          p95_duration_ms: null,
          durations: [],
        });
      }
    }

    const buckets: TrendsRow[] = [...bucketsMap.values()]
      .sort((a, b) => a.bucket_start_ms - b.bucket_start_ms)
      .map((b) => {
        const sorted = [...b.durations].sort((a, c) => a - c);
        const { durations: _d, ...rest } = b;
        return {
          ...rest,
          p50_duration_ms: percentile(sorted, 50),
          p95_duration_ms: percentile(sorted, 95),
        };
      });

    // By model.
    const byModel = new Map<string, ModelBreakdown>();
    for (const sp of spans) {
      if (sp.kind !== 'llm.call') continue;
      try {
        const a = JSON.parse(sp.attributes ?? '{}') as Record<string, unknown>;
        const model = String(a['gen_ai.request.model'] ?? 'unknown');
        let m = byModel.get(model);
        if (!m) {
          m = { model, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
          byModel.set(model, m);
        }
        m.calls += 1;
        m.input_tokens += Number(a['gen_ai.usage.input_tokens'] ?? 0) || 0;
        m.output_tokens += Number(a['gen_ai.usage.output_tokens'] ?? 0) || 0;
        m.cost_usd += Number(a['gen_ai.usage.cost_usd'] ?? 0) || 0;
      } catch {
        /* ignore */
      }
    }

    // By tool.
    const byTool = new Map<string, ToolBreakdown & { _durations: number[] }>();
    for (const sp of spans) {
      if (sp.kind !== 'tool.call') continue;
      try {
        const a = JSON.parse(sp.attributes ?? '{}') as Record<string, unknown>;
        const name = String(a['tool.name'] ?? 'unknown');
        const sideRaw = a['tool.side'];
        const side: ToolBreakdown['side'] =
          sideRaw === 'server' || sideRaw === 'client' ? sideRaw : 'unknown';
        const key = `${name}|${side}`;
        let t = byTool.get(key);
        if (!t) {
          t = { tool_name: name, side, calls: 0, errors: 0, avg_duration_ms: null, _durations: [] };
          byTool.set(key, t);
        }
        t.calls += 1;
        if (sp.status === 'error') t.errors += 1;
        if (sp.ended_at !== null) t._durations.push(sp.ended_at - sp.started_at);
      } catch {
        /* ignore */
      }
    }

    const by_tool = [...byTool.values()].map((t) => ({
      tool_name: t.tool_name,
      side: t.side,
      calls: t.calls,
      errors: t.errors,
      avg_duration_ms:
        t._durations.length > 0 ? t._durations.reduce((a, b) => a + b, 0) / t._durations.length : null,
    }));

    return {
      range,
      bucket,
      buckets,
      by_model: [...byModel.values()].sort((a, b) => b.cost_usd - a.cost_usd),
      by_tool: by_tool.sort((a, b) => b.calls - a.calls),
      totals,
    };
  } finally {
    db.close();
  }
}
