import { NextResponse } from 'next/server';
import { extractPromptFromRequest, findOpenAgent, reexecutePrompt } from '@/lib/reexecute';
import { getBlobs, getRootDir, getStore } from '@/lib/store';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    prompt_override?: string;
    enable_anthropic_web_search?: boolean;
  };

  // 1. Resolve OpenAgent.
  const settings = await loadSettings();
  const oaPath = await findOpenAgent(settings.reexecute.openagent_path);
  if (!oaPath) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'OpenAgent checkout not found. Set Settings → Re-execute → OpenAgent path, or place a clone at ~/Documents/GitHub/openagent.',
      },
      { status: 400 },
    );
  }

  // 2. Get the prompt — either the user-supplied override or extracted from the original trace.
  let prompt = body.prompt_override?.trim() ?? '';
  if (!prompt) {
    const store = getStore();
    const detail = await store.getTrace(traceId);
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'trace not found' }, { status: 404 });
    }
    const firstLlm = [...detail.spans]
      .filter((s) => s.kind === 'llm.call')
      .sort((a, b) => a.started_at - b.started_at)[0];
    if (!firstLlm?.refs?.request) {
      return NextResponse.json(
        { ok: false, error: 'no llm.call request blob to extract a prompt from' },
        { status: 400 },
      );
    }
    try {
      const blobs = getBlobs();
      const buf = await blobs.get(firstLlm.refs.request);
      const text = new TextDecoder().decode(buf);
      const reqJson = JSON.parse(text);
      prompt = extractPromptFromRequest(reqJson);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `failed to load request blob: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'extracted prompt is empty' }, { status: 400 });
  }

  // 3. Spawn OpenAgent in headless mode.
  const result = await reexecutePrompt({
    prompt,
    openagentPath: oaPath,
    runtime: settings.reexecute.runtime,
    wyrdDir: getRootDir(),
    ...(body.enable_anthropic_web_search ? { enableAnthropicWebSearch: true } : {}),
  });

  return NextResponse.json({
    ...result,
    openagent_path: oaPath,
    prompt_preview: prompt.length > 200 ? prompt.slice(0, 197) + '…' : prompt,
  });
}
