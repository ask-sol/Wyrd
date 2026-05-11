import { join } from 'node:path';
import { getRootDir } from './store';

export interface AgentSummary {
  agent_id: string;
  versions: string[];
  total_runs: number;
  ok_runs: number;
  error_runs: number;
  running_runs: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  first_seen: number;
  last_seen: number;
}

export async function getAgentSummaries(): Promise<AgentSummary[]> {
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
  try {
    const traces = db
      .prepare(
        `SELECT trace_id, agent_id, agent_version, status, started_at, ended_at
         FROM traces`,
      )
      .all() as Array<{
      trace_id: string;
      agent_id: string;
      agent_version: string | null;
      status: string;
      started_at: number;
      ended_at: number | null;
    }>;

    const spanAgg = db
      .prepare(
        `SELECT trace_id,
                SUM(CAST(json_extract(attributes, '$."gen_ai.usage.cost_usd"') AS REAL)) AS cost,
                SUM(CAST(json_extract(attributes, '$."gen_ai.usage.input_tokens"') AS INTEGER)) AS input_tokens,
                SUM(CAST(json_extract(attributes, '$."gen_ai.usage.output_tokens"') AS INTEGER)) AS output_tokens
         FROM spans
         WHERE kind = 'llm.call'
         GROUP BY trace_id`,
      )
      .all() as Array<{
      trace_id: string;
      cost: number | null;
      input_tokens: number | null;
      output_tokens: number | null;
    }>;

    const byTrace = new Map<string, { cost: number; input: number; output: number }>();
    for (const r of spanAgg) {
      byTrace.set(r.trace_id, {
        cost: r.cost ?? 0,
        input: r.input_tokens ?? 0,
        output: r.output_tokens ?? 0,
      });
    }

    const byAgent = new Map<string, AgentSummary>();
    for (const t of traces) {
      let s = byAgent.get(t.agent_id);
      if (!s) {
        s = {
          agent_id: t.agent_id,
          versions: [],
          total_runs: 0,
          ok_runs: 0,
          error_runs: 0,
          running_runs: 0,
          total_cost_usd: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          first_seen: t.started_at,
          last_seen: t.started_at,
        };
        byAgent.set(t.agent_id, s);
      }
      s.total_runs += 1;
      if (t.status === 'ok') s.ok_runs += 1;
      else if (t.status === 'error') s.error_runs += 1;
      else if (t.status === 'running') s.running_runs += 1;
      if (t.agent_version && !s.versions.includes(t.agent_version)) {
        s.versions.push(t.agent_version);
      }
      if (t.started_at < s.first_seen) s.first_seen = t.started_at;
      if (t.started_at > s.last_seen) s.last_seen = t.started_at;
      const agg = byTrace.get(t.trace_id);
      if (agg) {
        s.total_cost_usd += agg.cost;
        s.total_input_tokens += agg.input;
        s.total_output_tokens += agg.output;
      }
    }

    return [...byAgent.values()].sort((a, b) => b.last_seen - a.last_seen);
  } finally {
    db.close();
  }
}
