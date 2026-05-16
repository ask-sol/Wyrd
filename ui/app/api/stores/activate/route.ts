import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface StoreEntry {
  dir: string;
  name: string;
  created_at: number;
  last_used_at: number;
}
interface Registry {
  version: 1;
  stores: StoreEntry[];
  active?: string;
}

const REGISTRY_PATH = join(homedir(), '.wyrd-stores', '.registry.json');

async function readRegistry(): Promise<Registry> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Registry;
    if (parsed.version === 1) return parsed;
  } catch {
    /* fall through */
  }
  return { version: 1, stores: [] };
}

async function writeRegistry(r: Registry): Promise<void> {
  await fs.mkdir(dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(r, null, 2));
}

export async function POST(req: Request) {
  let body: { dir?: string };
  try {
    body = (await req.json()) as { dir?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.dir) return NextResponse.json({ ok: false, error: 'dir required' }, { status: 400 });

  try {
    const st = await fs.stat(body.dir);
    if (!st.isDirectory()) {
      return NextResponse.json({ ok: false, error: 'not a directory' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'directory does not exist' }, { status: 404 });
  }

  const reg = await readRegistry();
  reg.active = body.dir;
  // Touch last_used_at on the active entry if it exists.
  const i = reg.stores.findIndex((s) => s.dir === body.dir);
  if (i >= 0) {
    const existing = reg.stores[i]!;
    reg.stores[i] = { ...existing, last_used_at: Date.now() };
  }
  await writeRegistry(reg);
  return NextResponse.json({ ok: true, active: body.dir });
}
