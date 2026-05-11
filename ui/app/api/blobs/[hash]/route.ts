import { NextResponse } from 'next/server';
import { getBlobs } from '@/lib/store';

export const dynamic = 'force-dynamic';

const HEX_64 = /^[0-9a-f]{64}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  try {
    const { hash } = await params;
    if (!HEX_64.test(hash)) {
      return NextResponse.json({ error: 'invalid hash' }, { status: 400 });
    }
    const blobs = getBlobs();
    if (!(await blobs.has(hash))) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const bytes = await blobs.get({
      algo: 'sha256',
      hash,
      size: 0,
      content_type: 'application/octet-stream',
      encoding: 'raw',
    });
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
