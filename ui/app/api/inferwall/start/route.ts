import { NextResponse } from 'next/server';
import { start } from '@/lib/inferwall';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(await start());
}
