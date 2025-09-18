import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { username: string };
}

export async function GET(request: Request, context: RouteContext) {
  const player = await prisma.user.findFirst({
    where: {
      OR: [{ id: context.params.username }, { username: context.params.username }]
    },
    include: {
      ratingHistory: {
        orderBy: { playedAt: 'asc' },
        take: 200
      }
    }
  });

  if (!player) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const matches = await prisma.match.findMany({
    where: {
      participants: {
        some: { userId: player.id }
      }
    },
    orderBy: { playedAt: 'desc' },
    take: 20,
    include: {
      participants: {
        include: { user: true, team: true }
      }
    }
  });

  return NextResponse.json({ player, matches });
}
