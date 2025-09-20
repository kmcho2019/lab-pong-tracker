import { NextResponse } from 'next/server';
import { getTournamentDetail } from '@/server/tournament-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, context: RouteContext) {
  const tournament = await getTournamentDetail(context.params.id);
  if (!tournament) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({ tournament });
}
