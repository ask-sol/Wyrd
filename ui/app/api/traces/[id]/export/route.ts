import { NextResponse } from 'next/server';
import { exportTrace } from '@/lib/bundle';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const sanitize = url.searchParams.get('sanitize') === '1';
  try {
    const buf = await exportTrace(id, { sanitize });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${id}.wyrdpack"`,
        'content-length': String(buf.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
