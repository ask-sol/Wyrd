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
    if (parsed.version === 1 && Array.isArray(parsed.stores)) return parsed;
  } catch {
    /* fall through */
  }
  return { version: 1, stores: [] };
}

async function writeRegistry(r: Registry): Promise<void> {
  await fs.mkdir(dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(r, null, 2));
}

interface Body {
  dir?: string;
  name?: string;
  setActive?: boolean;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.dir) return NextResponse.json({ ok: false, error: 'dir required' }, { status: 400 });

  const reg = await readRegistry();
  const now = Date.now();
  const i = reg.stores.findIndex((s) => s.dir === body.dir);
  if (i >= 0) {
    const existing = reg.stores[i]!;
    reg.stores[i] = {
      ...existing,
      name: body.name?.trim() || existing.name,
      last_used_at: now,
    };
  } else {
    reg.stores.unshift({
      dir: body.dir,
      name: body.name?.trim() || body.dir.split('/').filter(Boolean).slice(-1)[0]!,
      created_at: now,
      last_used_at: now,
    });
  }
  if (body.setActive) reg.active = body.dir;
  await writeRegistry(reg);
  return NextResponse.json({ ok: true, registry: reg });
}

export async function GET() {
  const reg = await readRegistry();
  return NextResponse.json(reg);
}
