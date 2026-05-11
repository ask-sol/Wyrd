import { NextResponse } from 'next/server';
import { deleteAnnotation, updateAnnotation } from '@/lib/annotations';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { severity?: 'info' | 'good' | 'bug' | 'finetune'; body?: string };
  const ann = await updateAnnotation(id, body);
  if (!ann) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ annotation: ann });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteAnnotation(id);
  return NextResponse.json({ ok });
}
