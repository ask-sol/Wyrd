import { NextResponse } from 'next/server';
import { canonicalJsonStringify } from 'wyrd';
import { getBlobs, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface ReplayResult {
  ok: boolean;
  tool_name?: string;
  cached_args?: unknown;
  cached_result?: unknown;
  cache_key?: string;
  recomputed_key?: string;
  deterministic?: boolean;
  safe_to_replay?: boolean;
  error?: string;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ traceId: string; spanId: string }> },
) {
  const { traceId, spanId } = await ctx.params;
  try {
    const store = getStore();
    const blobs = getBlobs();
    const detail = await store.getTrace(traceId);
    if (!detail) return NextResponse.json({ ok: false, error: 'trace not found' } satisfies ReplayResult, { status: 404 });

    const span = detail.spans.find((s) => s.span_id === spanId);
    if (!span) return NextResponse.json({ ok: false, error: 'span not found' } satisfies ReplayResult, { status: 404 });
    if (span.kind !== 'tool.call') {
      return NextResponse.json(
        { ok: false, error: `span kind is ${span.kind}, expected tool.call` } satisfies ReplayResult,
        { status: 400 },
      );
    }

    const argsRef = span.refs?.tool_args;
    const resultRef = span.refs?.tool_result;
    if (!argsRef) {
      return NextResponse.json({ ok: false, error: 'no cached args' } satisfies ReplayResult, { status: 400 });
    }

    const argsBuf = await blobs.get(argsRef);
    const resultBuf = resultRef ? await blobs.get(resultRef) : null;
    if (!argsBuf) {
      return NextResponse.json({ ok: false, error: 'args blob missing' } satisfies ReplayResult, { status: 410 });
    }

    const argsText = new TextDecoder().decode(argsBuf);
    const resultText = resultBuf ? new TextDecoder().decode(resultBuf) : null;
    let parsedArgs: unknown = argsText;
    let parsedResult: unknown = resultText;
    try { parsedArgs = JSON.parse(argsText); } catch { /* keep as string */ }
    if (resultText) {
      try { parsedResult = JSON.parse(resultText); } catch { /* keep as string */ }
    }

    const toolName = typeof span.attributes['tool.name'] === 'string' ? (span.attributes['tool.name'] as string) : span.name;
    const safeToReplay = span.attributes['tool.safe_to_replay'] === true;
    const recomputedKey = canonicalJsonStringify({ tool: toolName, args: parsedArgs });
    const cacheKey = typeof span.attributes['tool.cache_key'] === 'string'
      ? (span.attributes['tool.cache_key'] as string)
      : undefined;

    return NextResponse.json({
      ok: true,
      tool_name: toolName,
      cached_args: parsedArgs,
      cached_result: parsedResult,
      cache_key: cacheKey,
      recomputed_key: recomputedKey,
      deterministic: cacheKey ? cacheKey === recomputedKey : true,
      safe_to_replay: safeToReplay,
    } satisfies ReplayResult);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ReplayResult,
      { status: 500 },
    );
  }
}
