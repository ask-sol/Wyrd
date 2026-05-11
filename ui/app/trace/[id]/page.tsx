import { notFound } from 'next/navigation';
import { rollupCost } from 'wyrd';
import { Shell } from '@/components/Shell';
import { TraceDetailClient } from '@/components/TraceDetailClient';
import { getRootDir, getStore } from '@/lib/store';
import type { TraceDetailPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadTrace(id: string): Promise<TraceDetailPayload | null> {
  const store = getStore();
  const detail = await store.getTrace(id);
  if (!detail) return null;
  const r = rollupCost(detail.spans);
  return {
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
}

export default async function TracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await loadTrace(id);
  if (!payload) notFound();

  const shortish = id.length > 18 ? id.slice(0, 18) + '…' : id;

  return (
    <Shell
      crumbs={[{ label: 'Traces', href: '/' }, { label: shortish }]}
      storeDir={getRootDir()}
    >
      <TraceDetailClient payload={payload} />
    </Shell>
  );
}
