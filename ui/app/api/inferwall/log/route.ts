import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getRootDir } from '@/lib/store';

export const dynamic = 'force-dynamic';

const TAIL_BYTES = 8 * 1024;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const which = url.searchParams.get('which') === 'install' ? 'install' : 'server';
  const path = join(getRootDir(), 'inferwall', `${which}.log`);
  try {
    const stat = await fs.stat(path);
    const start = Math.max(0, stat.size - TAIL_BYTES);
    const handle = await fs.open(path, 'r');
    try {
      const buf = Buffer.alloc(stat.size - start);
      await handle.read(buf, 0, buf.length, start);
      return NextResponse.json({
        ok: true,
        path,
        size: stat.size,
        truncated: start > 0,
        text: buf.toString('utf8'),
      });
    } finally {
      await handle.close();
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      path,
      text: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
