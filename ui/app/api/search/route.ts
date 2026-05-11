import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getRootDir } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface Hit {
  kind: 'trace' | 'agent' | 'span';
  label: string;
  detail: string;
  href: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const sqlitePath = join(getRootDir(), 'traces.sqlite3');
  let Database: typeof import('better-sqlite3');
  try {
    Database = (await import('better-sqlite3')).default;
  } catch {
    return NextResponse.json({ hits: [] });
  }
  let db: import('better-sqlite3').Database;
  try {
    db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  } catch {
    return NextResponse.json({ hits: [] });
  }
  db.pragma('busy_timeout = 2000');

  const like = `%${q}%`;
  const hits: Hit[] = [];

  try {
    const traceRows = db
      .prepare(
        `SELECT trace_id, agent_id, agent_version, status, started_at
         FROM traces
         WHERE trace_id LIKE ? OR agent_id LIKE ?
         ORDER BY started_at DESC LIMIT 6`,
      )
      .all(like, like) as Array<{
      trace_id: string;
      agent_id: string;
      agent_version: string | null;
      status: string;
      started_at: number;
    }>;
    for (const r of traceRows) {
      hits.push({
        kind: 'trace',
        label: r.trace_id,
        detail: `${r.agent_id}${r.agent_version ? ` v${r.agent_version}` : ''} · ${r.status}`,
        href: `/trace/${r.trace_id}`,
      });
    }

    const agentRows = db
      .prepare(
        `SELECT agent_id, COUNT(*) AS n, MAX(started_at) AS last_seen
         FROM traces
         WHERE agent_id LIKE ?
         GROUP BY agent_id
         ORDER BY last_seen DESC LIMIT 4`,
      )
      .all(like) as Array<{ agent_id: string; n: number; last_seen: number }>;
    for (const r of agentRows) {
      hits.push({
        kind: 'agent',
        label: r.agent_id,
        detail: `${r.n} run${r.n === 1 ? '' : 's'}`,
        href: `/?agent=${encodeURIComponent(r.agent_id)}`,
      });
    }

    const spanRows = db
      .prepare(
        `SELECT trace_id, span_id, kind, name
         FROM spans
         WHERE name LIKE ?
         ORDER BY started_at DESC LIMIT 4`,
      )
      .all(like) as Array<{ trace_id: string; span_id: string; kind: string; name: string }>;
    for (const r of spanRows) {
      hits.push({
        kind: 'span',
        label: r.name,
        detail: `${r.kind} · trace ${r.trace_id.slice(0, 12)}…`,
        href: `/trace/${r.trace_id}#${r.span_id}`,
      });
    }
  } finally {
    db.close();
  }

  return NextResponse.json({ hits });
}
