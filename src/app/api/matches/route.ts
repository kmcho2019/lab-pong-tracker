import { NextResponse } from 'next/server';
import { MatchStatus, ResultType } from '@prisma/client';
import { auth } from '@/server/auth';
import { matchPayloadSchema } from '@/lib/validators';
import { prisma } from '@/lib/prisma';
import { applyRatingsForMatch } from '@/server/rating-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const currentUser = session.user;

  const body = await request.json();
  const parsed = matchPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const payload = parsed.data;

  const playerIds = [...payload.team1, ...payload.team2];
  const players = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: { id: true }
  });
  if (players.length !== playerIds.length) {
    return NextResponse.json({ error: 'All players must exist' }, { status: 400 });
  }

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.match.create({
      data: {
        matchType: payload.matchType,
        status: MatchStatus.CONFIRMED,
        resultType: ResultType.NORMAL,
        team1Score: payload.team1Score,
        team2Score: payload.team2Score,
        targetPoints: payload.targetPoints ?? 11,
        winByMargin: payload.winByMargin ?? 2,
        playedAt: payload.playedAt ? new Date(payload.playedAt) : new Date(),
        location: payload.location,
        note: payload.note,
        enteredById: currentUser.id,
        confirmedById: currentUser.id,
        confirmedAt: new Date(),
        teams: {
          create: [{ teamNo: 1 }, { teamNo: 2 }]
        }
      },
      include: {
        teams: true
      }
    });

    const team1 = created.teams.find((team) => team.teamNo === 1);
    const team2 = created.teams.find((team) => team.teamNo === 2);
    if (!team1 || !team2) {
      throw new Error('Failed to create match teams');
    }

    await tx.matchParticipant.createMany({
      data: [
        ...payload.team1.map((playerId) => ({
          matchId: created.id,
          userId: playerId,
          teamId: team1.id
        })),
        ...payload.team2.map((playerId) => ({
          matchId: created.id,
          userId: playerId,
          teamId: team2.id
        }))
      ]
    });

    await tx.auditLog.create({
      data: {
        actorId: currentUser.id,
        matchId: created.id,
        message: 'MATCH_CREATED',
        metadata: payload as any
      }
    });

    return created;
  });

  await applyRatingsForMatch(match.id);

  const hydrated = await prisma.match.findUnique({
    where: { id: match.id },
    include: {
      participants: {
        include: { user: true, team: true }
      }
    }
  });

  return NextResponse.json({ match: hydrated }, { status: 201 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      ...(playerId
        ? {
            participants: {
              some: { userId: playerId }
            }
          }
        : {})
    },
    orderBy: { playedAt: 'desc' },
    include: {
      participants: {
        include: {
          user: true,
          team: true
        }
      }
    }
  });

  return NextResponse.json({ matches });
}
