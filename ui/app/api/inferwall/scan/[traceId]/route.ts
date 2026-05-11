import { NextResponse } from 'next/server';
import { aggregateDecision, probeServer, scan, type InferwallVerdict } from '@/lib/inferwall';
import { scanText, type GuardVerdict } from '@/lib/wyrdGuard';
import { getBlobs, getStore } from '@/lib/store';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ScanItem {
  span_id: string;
  span_name: string;
  side: 'input' | 'output';
  verdict?: InferwallVerdict | GuardVerdict;
  scanner?: 'inferwall' | 'wyrd-guard';
  error?: string;
  cached?: boolean;
}

async function inferwallReachable(): Promise<boolean> {
  const s = await loadSettings();
  const probe = await probeServer(s.inferwall.base_url, s.inferwall.api_key);
  return probe.ok;
}

/**
 * Extract only the user-supplied content from a captured LLM request.
 * The system prompt and tool declarations are developer-controlled — scanning
 * them produces noise (system prompts routinely contain phrases like
 * "ignore previous instructions" that legitimately appear in system rules).
 *
 * Returns an empty string if there's nothing user-supplied.
 */
function extractUserInput(buf: Uint8Array): string {
  const text = new TextDecoder().decode(buf);
  let req: unknown;
  try {
    req = JSON.parse(text);
  } catch {
    // Not JSON — best effort: scan the raw text.
    return text;
  }
  if (!req || typeof req !== 'object') return '';
  const messages = (req as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return '';
  const parts: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    if (role !== 'user' && role !== 'tool') continue;
    const content = (m as { content?: unknown }).content;
    if (typeof content === 'string') {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object') {
          const t = (block as { text?: unknown; content?: unknown }).text;
          const c = (block as { content?: unknown }).content;
          if (typeof t === 'string') parts.push(t);
          else if (typeof c === 'string') parts.push(c);
        }
      }
    }
  }
  return parts.join('\n\n---\n\n');
}

/**
 * Extract scannable assistant output. We scan response text (which the user
 * sees) but NOT tool declarations or finish_reason metadata.
 */
function extractAssistantOutput(buf: Uint8Array): string {
  const text = new TextDecoder().decode(buf);
  let resp: unknown;
  try {
    resp = JSON.parse(text);
  } catch {
    return text;
  }
  if (!resp || typeof resp !== 'object') return '';
  const r = resp as { text?: unknown; tool_executed?: unknown };
  const parts: string[] = [];
  if (typeof r.text === 'string') parts.push(r.text);
  // Tool results returned by anthropic server tools (web_search etc.) are
  // assistant-visible output — scan them too.
  if (Array.isArray(r.tool_executed)) {
    for (const te of r.tool_executed) {
      if (te && typeof te === 'object') {
        const res = (te as { result?: unknown }).result;
        if (typeof res === 'string') parts.push(res);
      }
    }
  }
  return parts.join('\n\n');
}

export async function POST(_req: Request, ctx: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await ctx.params;
  const store = getStore();
  const blobs = getBlobs();
  const detail = await store.getTrace(traceId);
  if (!detail) return NextResponse.json({ ok: false, error: 'trace not found' }, { status: 404 });

  const items: ScanItem[] = [];
  const useInferwall = await inferwallReachable();

  async function runScan(text: string, cacheKey: string, side: 'input' | 'output') {
    if (useInferwall) {
      const r = await scan(text, cacheKey, side);
      if (r.ok) return { scanner: 'inferwall' as const, verdict: r.verdict, cached: r.cached };
      // Inferwall failed mid-scan — fall through to built-in.
    }
    const verdict = scanText(text, side);
    return { scanner: 'wyrd-guard' as const, verdict, cached: false };
  }

  for (const s of detail.spans) {
    if (s.kind !== 'llm.call') continue;
    const reqRef = s.refs?.request;
    const respRef = s.refs?.response;

    if (reqRef) {
      try {
        const buf = await blobs.get(reqRef);
        const userInput = extractUserInput(buf);
        if (userInput.length === 0) {
          // Nothing user-supplied to scan — skip rather than fabricate a verdict.
        } else {
          const r = await runScan(userInput, `${reqRef.hash}:user`, 'input');
          items.push({
            span_id: s.span_id,
            span_name: s.name,
            side: 'input',
            verdict: r.verdict,
            scanner: r.scanner,
            cached: r.cached,
          });
        }
      } catch (err) {
        items.push({
          span_id: s.span_id,
          span_name: s.name,
          side: 'input',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (respRef) {
      try {
        const buf = await blobs.get(respRef);
        const assistantText = extractAssistantOutput(buf);
        if (assistantText.length === 0) {
          // No assistant text to scan.
        } else {
          const r = await runScan(assistantText, `${respRef.hash}:assistant`, 'output');
          items.push({
            span_id: s.span_id,
            span_name: s.name,
            side: 'output',
            verdict: r.verdict,
            scanner: r.scanner,
            cached: r.cached,
          });
        }
      } catch (err) {
        items.push({
          span_id: s.span_id,
          span_name: s.name,
          side: 'output',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const verdicts = items.filter((i) => i.verdict).map((i) => i.verdict as InferwallVerdict);
  const overall = aggregateDecision(verdicts);

  return NextResponse.json({
    ok: true,
    overall,
    items,
    scanner_used: useInferwall ? 'inferwall' : 'wyrd-guard',
  });
}
