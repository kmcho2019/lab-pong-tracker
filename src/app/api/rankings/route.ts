import { NextResponse } from 'next/server';
import { getLeaderboard, type LeaderboardMode } from '@/server/league-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get('scope') as 'active' | 'all') ?? 'active';
  const mode = (searchParams.get('mode') as LeaderboardMode) ?? 'overall';
  const rankings = await getLeaderboard(scope, mode);
  return NextResponse.json({ rankings });
}
