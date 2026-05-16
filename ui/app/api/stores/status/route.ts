import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface StatusOut {
  exists: boolean;
  hasDb: boolean;
  dbBytes: number;
  dbMtimeMs: number | null;
  traceCount: number;
  spanCount: number;
  lastTraceAt: number | null;
  blobCount: number;
  /** Any signal that the store has activity beyond what wyrd-ui created. */
  hasActivity: boolean;
  /** Surface fatal read errors instead of swallowing them. */
  error?: string;
}

async function countBlobs(dir: string): Promise<number> {
  let n = 0;
  async function walk(d: string) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && /^[0-9a-f]{60,}$/.test(e.name)) n += 1;
    }
  }
  await walk(dir);
  return n;
}

async function tableExists(
  db: import('better-sqlite3').Database,
  name: string,
): Promise<boolean> {
  const r = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { 1: number } | undefined;
  return !!r;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }
  const out: StatusOut = {
    exists: false,
    hasDb: false,
    dbBytes: 0,
    dbMtimeMs: null,
    traceCount: 0,
    spanCount: 0,
    lastTraceAt: null,
    blobCount: 0,
    hasActivity: false,
  };
  try {
    const st = await fs.stat(path);
    if (!st.isDirectory()) return NextResponse.json(out);
    out.exists = true;
  } catch {
    return NextResponse.json(out);
  }

  const dbPath = join(path, 'traces.sqlite3');
  try {
    const dbStat = await fs.stat(dbPath);
    out.hasDb = true;
    out.dbBytes = dbStat.size;
    out.dbMtimeMs = dbStat.mtimeMs;
  } catch {
    /* no DB yet — totally fine for a brand-new store */
  }

  if (out.hasDb) {
    try {
      const { default: Database } = await import('better-sqlite3');
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        if (await tableExists(db, 'traces')) {
          const r = db.prepare('SELECT COUNT(*) AS c FROM traces').get() as { c: number };
          out.traceCount = r.c ?? 0;
          const m = db
            .prepare('SELECT MAX(started_at) AS m FROM traces')
            .get() as { m: number | null };
          out.lastTraceAt = m.m ?? null;
        }
        if (await tableExists(db, 'spans')) {
          const r = db.prepare('SELECT COUNT(*) AS c FROM spans').get() as { c: number };
          out.spanCount = r.c ?? 0;
        }
      } finally {
        db.close();
      }
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    out.blobCount = await countBlobs(join(path, 'blobs'));
  } catch {
    /* ignore */
  }

  // "Activity" = anything beyond just the bare directories that wyrd-ui
  // creates upfront. A DB file or a content-addressed blob means the agent
  // actually wrote something.
  out.hasActivity = out.hasDb || out.spanCount > 0 || out.traceCount > 0 || out.blobCount > 0;

  return NextResponse.json(out);
}
