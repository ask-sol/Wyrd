import { NextResponse } from 'next/server';
import { rollupCost } from 'wyrd';
import { getBlobs, getStore } from '@/lib/store';
import { diffSpans, diffWords } from '@/lib/diff';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function loadResponseText(refHash: string | undefined): Promise<string> {
  if (!refHash) return '';
  try {
    const blobs = getBlobs();
    const buf = await blobs.get({ algo: 'sha256', hash: refHash, size: 0, content_type: '' } as Parameters<typeof blobs.get>[0]);
    const text = new TextDecoder().decode(buf);
    try {
      const json = JSON.parse(text) as { text?: string };
      return typeof json.text === 'string' ? json.text : text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = url.searchParams.get('a');
  const b = url.searchParams.get('b');
  if (!a || !b) return NextResponse.json({ error: 'a and b query params required' }, { status: 400 });
  if (a === b) return NextResponse.json({ error: 'a and b must differ' }, { status: 400 });

  const store = getStore();
  const [detailA, detailB] = await Promise.all([store.getTrace(a), store.getTrace(b)]);
  if (!detailA || !detailB) {
    return NextResponse.json({ error: 'trace not found' }, { status: 404 });
  }

  const rollupA = rollupCost(detailA.spans);
  const rollupB = rollupCost(detailB.spans);

  // Spans diff.
  const spanDiff = diffSpans(
    detailA.spans.map((s) => ({
      span_id: s.span_id,
      name: s.name,
      kind: s.kind,
      started_at: s.started_at,
      ended_at: s.ended_at,
      attributes: s.attributes as Record<string, unknown>,
    })),
    detailB.spans.map((s) => ({
      span_id: s.span_id,
      name: s.name,
      kind: s.kind,
      started_at: s.started_at,
      ended_at: s.ended_at,
      attributes: s.attributes as Record<string, unknown>,
    })),
  );

  // Final-response text diff (concatenate text from all llm.call spans, in order).
  const llmA = detailA.spans.filter((s) => s.kind === 'llm.call').sort((x, y) => x.started_at - y.started_at);
  const llmB = detailB.spans.filter((s) => s.kind === 'llm.call').sort((x, y) => x.started_at - y.started_at);
  const responseA = (
    await Promise.all(llmA.map((s) => loadResponseText(s.refs?.response?.hash)))
  ).join('\n\n');
  const responseB = (
    await Promise.all(llmB.map((s) => loadResponseText(s.refs?.response?.hash)))
  ).join('\n\n');
  const wordDiff = diffWords(responseA, responseB);

  return NextResponse.json({
    a: {
      trace_id: detailA.trace.trace_id,
      agent_id: detailA.trace.agent_id,
      agent_version: detailA.trace.agent_version,
      status: detailA.trace.status,
      started_at: detailA.trace.started_at,
      ended_at: detailA.trace.ended_at,
      span_count: detailA.spans.length,
      cost_usd: rollupA.totalCostUsd,
      input_tokens: rollupA.totalInputTokens,
      output_tokens: rollupA.totalOutputTokens,
      llm_calls: rollupA.llmCalls,
      tool_calls: rollupA.toolCalls,
    },
    b: {
      trace_id: detailB.trace.trace_id,
      agent_id: detailB.trace.agent_id,
      agent_version: detailB.trace.agent_version,
      status: detailB.trace.status,
      started_at: detailB.trace.started_at,
      ended_at: detailB.trace.ended_at,
      span_count: detailB.spans.length,
      cost_usd: rollupB.totalCostUsd,
      input_tokens: rollupB.totalInputTokens,
      output_tokens: rollupB.totalOutputTokens,
      llm_calls: rollupB.llmCalls,
      tool_calls: rollupB.toolCalls,
    },
    spans: spanDiff,
    response_diff: wordDiff,
  });
}
