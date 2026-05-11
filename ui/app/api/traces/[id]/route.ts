import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { rollupCost } from 'wyrd';
import type { TraceDetailPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const detail = await store.getTrace(id);
    if (!detail) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const r = rollupCost(detail.spans);
    const payload: TraceDetailPayload = {
      trace: detail.trace,
      spans: detail.spans,
      events: detail.events,
      links: detail.links,
      rollup: {
        total_cost_usd: r.totalCostUsd,
        total_input_tokens: r.totalInputTokens,
        total_output_tokens: r.totalOutputTokens,
        llm_calls: r.llmCalls,
        tool_calls: r.toolCalls,
      },
    };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
