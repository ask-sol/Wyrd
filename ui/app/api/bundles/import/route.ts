import { NextResponse } from 'next/server';
import { importBundle } from '@/lib/bundle';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.byteLength === 0) {
      return NextResponse.json({ ok: false, error: 'empty body' }, { status: 400 });
    }
    const r = await importBundle(buf);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
