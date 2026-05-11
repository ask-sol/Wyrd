import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getRootDir } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface GcResult {
  ok: boolean;
  scanned_blobs: number;
  referenced_blobs: number;
  deleted_blobs: number;
  reclaimed_bytes: number;
  error?: string;
}

async function walkBlobHashes(dir: string): Promise<Array<{ hash: string; path: string; size: number }>> {
  const out: Array<{ hash: string; path: string; size: number }> = [];
  async function walk(d: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile()) {
        const s = await fs.stat(p);
        out.push({ hash: ent.name, path: p, size: s.size });
      }
    }
  }
  await walk(dir);
  return out;
}

export async function POST() {
  const root = getRootDir();
  const sqlitePath = join(root, 'traces.sqlite3');
  const blobsDir = join(root, 'blobs');

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    const referenced = new Set<string>();
    try {
      const fromSpans = db
        .prepare('SELECT refs FROM spans WHERE refs IS NOT NULL')
        .all() as Array<{ refs: string }>;
      for (const r of fromSpans) {
        try {
          const obj = JSON.parse(r.refs ?? '{}') as Record<string, { hash?: string }>;
          for (const v of Object.values(obj)) {
            if (v && typeof v.hash === 'string') referenced.add(v.hash);
          }
        } catch {
          /* ignore */
        }
      }
      const fromEvents = db
        .prepare('SELECT ref FROM events WHERE ref IS NOT NULL')
        .all() as Array<{ ref: string }>;
      for (const r of fromEvents) {
        try {
          const obj = JSON.parse(r.ref ?? 'null') as { hash?: string } | null;
          if (obj && typeof obj.hash === 'string') referenced.add(obj.hash);
        } catch {
          /* ignore */
        }
      }
    } finally {
      db.close();
    }

    const blobs = await walkBlobHashes(blobsDir);
    let deleted = 0;
    let reclaimed = 0;
    for (const b of blobs) {
      if (!referenced.has(b.hash)) {
        try {
          await fs.unlink(b.path);
          deleted += 1;
          reclaimed += b.size;
        } catch {
          /* ignore */
        }
      }
    }

    return NextResponse.json({
      ok: true,
      scanned_blobs: blobs.length,
      referenced_blobs: referenced.size,
      deleted_blobs: deleted,
      reclaimed_bytes: reclaimed,
    } satisfies GcResult);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        scanned_blobs: 0,
        referenced_blobs: 0,
        deleted_blobs: 0,
        reclaimed_bytes: 0,
        error: err instanceof Error ? err.message : String(err),
      } satisfies GcResult,
      { status: 500 },
    );
  }
}
