import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface CreateBody {
  name?: string;
  baseDir?: string;
}

function expand(p: string): string {
  return p.startsWith('~') ? resolve(homedir(), p.slice(2)) : p;
}

function safeName(n: string): string {
  // Allow letters, digits, dash, underscore, dot. Reject anything else.
  return n.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const name = safeName((body.name ?? 'wyrd-store').trim() || 'wyrd-store');
  const rawBase = expand((body.baseDir ?? `${homedir()}/.wyrd-stores`).trim());
  if (!isAbsolute(rawBase)) {
    return NextResponse.json({ ok: false, error: 'baseDir must be absolute' }, { status: 400 });
  }

  const dir = join(rawBase, name);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(join(dir, 'blobs'), { recursive: true });
    // We intentionally do NOT create traces.sqlite3 here — the Wyrd writer will
    // create it on first write with the correct schema. Creating an empty
    // file would race with the writer's migration logic.
    return NextResponse.json({ ok: true, dir, name });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
