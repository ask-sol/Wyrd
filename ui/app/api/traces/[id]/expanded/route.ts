import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { expandTrace } from '@/lib/expandTrace';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const store = getStore();
    const detail = await store.getTrace(id);
    if (!detail) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const virtual_nodes = await expandTrace(detail.spans);
    return NextResponse.json({ virtual_nodes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
