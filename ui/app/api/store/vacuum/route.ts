import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getRootDir } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST() {
  const path = join(getRootDir(), 'traces.sqlite3');
  try {
    const before = (await fs.stat(path)).size;
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(path, { fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    try {
      db.exec('VACUUM');
    } finally {
      db.close();
    }
    const after = (await fs.stat(path)).size;
    return NextResponse.json({ ok: true, before, after, saved_bytes: Math.max(0, before - after) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
