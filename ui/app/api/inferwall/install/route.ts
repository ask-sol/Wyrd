import { NextResponse } from 'next/server';
import { install, generateKey, start } from '@/lib/inferwall';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  const installed = await install();
  if (!installed.ok) {
    return NextResponse.json({ ok: false, step: 'install', log: installed.log }, { status: 500 });
  }
  const key = await generateKey();
  if (!key.ok) {
    return NextResponse.json({ ok: false, step: 'key', error: key.error });
  }
  const started = await start();
  return NextResponse.json({
    ok: started.ok,
    step: 'started',
    pid: started.pid,
    key_set: true,
    install_log: installed.log,
  });
}
