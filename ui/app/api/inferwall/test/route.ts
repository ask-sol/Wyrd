import { NextResponse } from 'next/server';
import { probeServer } from '@/lib/inferwall';
import type { InferwallSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const cfg = (await req.json()) as InferwallSettings;
  if (!cfg.base_url) {
    return NextResponse.json({ ok: false, error: 'no base_url configured' });
  }
  const started = Date.now();
  const probe = await probeServer(cfg.base_url, cfg.api_key);
  if (probe.ok) {
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - started,
      via: probe.via,
    });
  }
  return NextResponse.json({ ok: false, error: probe.error ?? 'unreachable' });
}
