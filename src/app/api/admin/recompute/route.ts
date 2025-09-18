import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { recomputeLeague } from '@/server/recompute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const from = body?.from ? new Date(body.from) : undefined;

  await recomputeLeague(from);

  return NextResponse.json({ status: 'OK' });
}
