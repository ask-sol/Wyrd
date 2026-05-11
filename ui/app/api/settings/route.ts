import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, type ConsoleSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as ConsoleSettings;
  await saveSettings(body);
  return NextResponse.json({ ok: true });
}
