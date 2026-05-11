import { NextResponse } from 'next/server';
import { stop } from '@/lib/inferwall';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(await stop());
}
