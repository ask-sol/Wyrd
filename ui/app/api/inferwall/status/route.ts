import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/inferwall';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getStatus());
}
