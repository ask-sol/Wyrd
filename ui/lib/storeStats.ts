import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getRootDir } from './store';

export interface StoreStats {
  dir: string;
  sqlite_bytes: number;
  sqlite_wal_bytes: number;
  blobs_bytes: number;
  blob_count: number;
  trace_count: number;
  trace_count_by_status: { ok: number; error: number; running: number };
  span_count: number;
  event_count: number;
  recent_blobs: Array<{ sha: string; size: number; modified_at: number }>;
}

async function fileSize(path: string): Promise<number> {
  try {
    const s = await fs.stat(path);
    return s.size;
  } catch {
    return 0;
  }
}

async function dirBytesAndCount(path: string): Promise<{ bytes: number; count: number }> {
  let bytes = 0;
  let count = 0;
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(p);
      } else if (ent.isFile()) {
        try {
          const s = await fs.stat(p);
          bytes += s.size;
          count += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(path);
  return { bytes, count };
}

async function recentBlobs(blobsDir: string, n: number): Promise<StoreStats['recent_blobs']> {
  const out: StoreStats['recent_blobs'] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile()) {
        try {
          const s = await fs.stat(p);
          out.push({ sha: ent.name, size: s.size, modified_at: s.mtimeMs });
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(blobsDir);
  out.sort((a, b) => b.modified_at - a.modified_at);
  return out.slice(0, n);
}

export async function getStoreStats(): Promise<StoreStats> {
  const dir = getRootDir();
  const sqlitePath = join(dir, 'traces.sqlite3');
  const walPath = join(dir, 'traces.sqlite3-wal');
  const blobsDir = join(dir, 'blobs');

  const [sqlite_bytes, sqlite_wal_bytes, blobs, recent_blobs] = await Promise.all([
    fileSize(sqlitePath),
    fileSize(walPath),
    dirBytesAndCount(blobsDir),
    recentBlobs(blobsDir, 20),
  ]);

  let trace_count = 0;
  let span_count = 0;
  let event_count = 0;
  const trace_count_by_status = { ok: 0, error: 0, running: 0 };

  if (sqlite_bytes > 0) {
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
      db.pragma('busy_timeout = 2000');
      try {
        trace_count = (db.prepare('SELECT COUNT(*) as n FROM traces').get() as { n: number }).n;
        span_count = (db.prepare('SELECT COUNT(*) as n FROM spans').get() as { n: number }).n;
        event_count = (db.prepare('SELECT COUNT(*) as n FROM events').get() as { n: number }).n;
        const rows = db
          .prepare('SELECT status, COUNT(*) as n FROM traces GROUP BY status')
          .all() as Array<{ status: string; n: number }>;
        for (const r of rows) {
          if (r.status === 'ok' || r.status === 'error' || r.status === 'running') {
            trace_count_by_status[r.status] = r.n;
          }
        }
      } finally {
        db.close();
      }
    } catch {
      /* tolerate read errors on cold start */
    }
  }

  return {
    dir,
    sqlite_bytes,
    sqlite_wal_bytes,
    blobs_bytes: blobs.bytes,
    blob_count: blobs.count,
    trace_count,
    trace_count_by_status,
    span_count,
    event_count,
    recent_blobs,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
