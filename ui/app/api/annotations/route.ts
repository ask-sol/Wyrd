import { NextResponse } from 'next/server';
import { createAnnotation, listAnnotationsForTrace } from '@/lib/annotations';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const trace_id = url.searchParams.get('trace_id');
  if (!trace_id) return NextResponse.json({ error: 'trace_id required' }, { status: 400 });
  const annotations = await listAnnotationsForTrace(trace_id);
  return NextResponse.json({ annotations });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      trace_id: string;
      span_id?: string | null;
      severity?: 'info' | 'good' | 'bug' | 'finetune';
      body: string;
    };
    if (!body.trace_id || !body.body || !body.body.trim()) {
      return NextResponse.json({ error: 'trace_id and body are required' }, { status: 400 });
    }
    const ann = await createAnnotation({
      trace_id: body.trace_id,
      span_id: body.span_id ?? null,
      severity: body.severity ?? 'info',
      body: body.body,
    });
    return NextResponse.json({ annotation: ann });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
