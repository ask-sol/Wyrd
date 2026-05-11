import { join } from 'node:path';
import { getRootDir } from './store';
import { countAnnotationsByTrace } from './annotations';
import type { TraceListItem } from './types';

interface ListOpts {
  status?: 'ok' | 'error' | 'running';
  agent?: string;
  limit?: number;
}

/**
 * Single-query trace list with rollups. Replaces the prior N+1 pattern
 * that called getTrace() per row.
 *
 * Aggregates per-trace:
 *   - span_count
 *   - sum(gen_ai.usage.cost_usd)        from llm.call spans
 *   - sum(gen_ai.usage.input_tokens)
 *   - sum(gen_ai.usage.output_tokens)
 *   - last_activity / last_activity_kind from the most-recently started span
 */
export async function listTracesAggregated(opts: ListOpts = {}): Promise<TraceListItem[]> {
  const sqlitePath = join(getRootDir(), 'traces.sqlite3');
  let Database: typeof import('better-sqlite3');
  try {
    Database = (await import('better-sqlite3')).default;
  } catch {
    return [];
  }
  let db: import('better-sqlite3').Database;
  try {
    db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  } catch {
    return [];
  }
  db.pragma('busy_timeout = 2000');

  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status) {
    conds.push('t.status = ?');
    params.push(opts.status);
  }
  if (opts.agent) {
    conds.push('t.agent_id = ?');
    params.push(opts.agent);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const aggRows = db
      .prepare(
        `SELECT
            t.trace_id, t.agent_id, t.agent_version, t.status,
            t.started_at, t.ended_at,
            COUNT(s.span_id) AS span_count,
            COALESCE(SUM(CASE WHEN s.kind='llm.call'
                              THEN CAST(json_extract(s.attributes, '$."gen_ai.usage.cost_usd"') AS REAL)
                              ELSE 0 END), 0) AS cost_usd,
            COALESCE(SUM(CASE WHEN s.kind='llm.call'
                              THEN CAST(json_extract(s.attributes, '$."gen_ai.usage.input_tokens"') AS INTEGER)
                              ELSE 0 END), 0) AS input_tokens,
            COALESCE(SUM(CASE WHEN s.kind='llm.call'
                              THEN CAST(json_extract(s.attributes, '$."gen_ai.usage.output_tokens"') AS INTEGER)
                              ELSE 0 END), 0) AS output_tokens
         FROM traces t
         LEFT JOIN spans s ON s.trace_id = t.trace_id
         ${where}
         GROUP BY t.trace_id
         ORDER BY t.started_at DESC
         LIMIT ?`,
      )
      .all(...params, limit) as Array<{
      trace_id: string;
      agent_id: string;
      agent_version: string | null;
      status: 'ok' | 'error' | 'running';
      started_at: number;
      ended_at: number | null;
      span_count: number;
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
    }>;

    if (aggRows.length === 0) return [];

    // Most-recently started span per trace (for the "currently in" indicator).
    // For running traces prefer a span that's not yet ended; otherwise just take max started_at.
    const placeholders = aggRows.map(() => '?').join(',');
    const lastActivityRows = db
      .prepare(
        `SELECT trace_id, name, kind, started_at, ended_at
         FROM spans
         WHERE trace_id IN (${placeholders})
         ORDER BY trace_id ASC, started_at DESC`,
      )
      .all(...aggRows.map((r) => r.trace_id)) as Array<{
      trace_id: string;
      name: string;
      kind: 'agent.step' | 'llm.call' | 'tool.call' | 'tool.result';
      started_at: number;
      ended_at: number | null;
    }>;

    const lastByTrace = new Map<
      string,
      { name: string; kind: 'agent.step' | 'llm.call' | 'tool.call' | 'tool.result' }
    >();
    for (const r of lastActivityRows) {
      const cur = lastByTrace.get(r.trace_id);
      if (!cur) {
        lastByTrace.set(r.trace_id, { name: r.name, kind: r.kind });
        continue;
      }
      // Prefer a still-running span over a completed one.
      if (r.ended_at === null) {
        lastByTrace.set(r.trace_id, { name: r.name, kind: r.kind });
      }
    }

    let noteCounts = new Map<string, number>();
    try {
      noteCounts = await countAnnotationsByTrace();
    } catch {
      /* annotations table may not exist on first run */
    }

    return aggRows.map<TraceListItem>((r) => ({
      trace_id: r.trace_id,
      agent_id: r.agent_id,
      agent_version: r.agent_version,
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
      duration_ms: r.ended_at !== null ? r.ended_at - r.started_at : null,
      span_count: Number(r.span_count) || 0,
      cost_usd: Number(r.cost_usd) || 0,
      input_tokens: Number(r.input_tokens) || 0,
      output_tokens: Number(r.output_tokens) || 0,
      last_activity: lastByTrace.get(r.trace_id)?.name ?? null,
      last_activity_kind: lastByTrace.get(r.trace_id)?.kind ?? null,
      note_count: noteCounts.get(r.trace_id) ?? 0,
    }));
  } finally {
    db.close();
  }
}
