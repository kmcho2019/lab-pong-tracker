import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/server/league-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get('scope') as 'active' | 'all') ?? 'active';
  const rankings = await getLeaderboard(scope);
  return NextResponse.json({ rankings });
}
