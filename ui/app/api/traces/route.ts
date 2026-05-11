import { NextResponse } from 'next/server';
import { listTracesAggregated } from '@/lib/traceList';
import type { TraceListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Status = TraceListItem['status'];

function asStatus(v: string | null): Status | undefined {
  if (v === 'ok' || v === 'error' || v === 'running') return v;
  return undefined;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = asStatus(url.searchParams.get('status'));
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10) || 500, 1000);
    const agent = url.searchParams.get('agent') ?? undefined;
    const traces = await listTracesAggregated({
      limit,
      ...(status ? { status } : {}),
      ...(agent ? { agent } : {}),
    });
    return NextResponse.json({ traces });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ traces: [], error: message }, { status: 500 });
  }
}
