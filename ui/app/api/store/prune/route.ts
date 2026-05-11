import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getRootDir } from '@/lib/store';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PruneResult {
  ok: boolean;
  cutoff_ms: number | null;
  deleted_traces: number;
  deleted_spans: number;
  deleted_events: number;
  deleted_links: number;
  error?: string;
}

export async function POST(req: Request) {
  const root = getRootDir();
  const sqlitePath = join(root, 'traces.sqlite3');

  let days: number | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { days?: number };
    if (typeof body.days === 'number' && body.days > 0) {
      days = body.days;
    } else {
      const settings = await loadSettings();
      days = settings.retention_days;
    }
  } catch {
    /* ignore */
  }

  if (!days || days <= 0) {
    return NextResponse.json(
      {
        ok: false,
        cutoff_ms: null,
        deleted_traces: 0,
        deleted_spans: 0,
        deleted_events: 0,
        deleted_links: 0,
        error: 'retention not configured — set Settings → retention days or POST {"days": N}',
      } satisfies PruneResult,
      { status: 400 },
    );
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(sqlitePath, { fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    try {
      const txn = db.transaction(() => {
        const trIds = (db.prepare('SELECT trace_id FROM traces WHERE started_at < ?').all(cutoff) as Array<{ trace_id: string }>).map(
          (r) => r.trace_id,
        );
        if (trIds.length === 0) {
          return { traces: 0, spans: 0, events: 0, links: 0 };
        }
        const placeholders = trIds.map(() => '?').join(',');
        const spans = db.prepare(`DELETE FROM spans WHERE trace_id IN (${placeholders})`).run(...trIds).changes;
        const events = db.prepare(`DELETE FROM events WHERE trace_id IN (${placeholders})`).run(...trIds).changes;
        const links = db.prepare(`DELETE FROM span_links WHERE trace_id IN (${placeholders})`).run(...trIds).changes;
        const traces = db.prepare(`DELETE FROM traces WHERE trace_id IN (${placeholders})`).run(...trIds).changes;
        return { traces, spans, events, links };
      });
      const { traces, spans, events, links } = txn();
      return NextResponse.json({
        ok: true,
        cutoff_ms: cutoff,
        deleted_traces: traces,
        deleted_spans: spans,
        deleted_events: events,
        deleted_links: links,
      } satisfies PruneResult);
    } finally {
      db.close();
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        cutoff_ms: cutoff,
        deleted_traces: 0,
        deleted_spans: 0,
        deleted_events: 0,
        deleted_links: 0,
        error: err instanceof Error ? err.message : String(err),
      } satisfies PruneResult,
      { status: 500 },
    );
  }
}
