import { NextResponse } from 'next/server';
import { getLeaderboard, getRecentMatches } from '@/server/league-service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const [players, matches, seasons] = await Promise.all([
    getLeaderboard('all'),
    getRecentMatches(100),
    prisma.season.findMany({ orderBy: { startDate: 'desc' } })
  ]);

  return NextResponse.json({
    players,
    matches,
    seasons
  });
}
