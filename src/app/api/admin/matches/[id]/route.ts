import { NextResponse } from 'next/server';
import { MatchStatus } from '@prisma/client';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { matchPayloadSchema } from '@/lib/validators';
import { recomputeLeague } from '@/server/recompute';

interface RouteContext {
  params: { id: string };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const admin = session?.user;
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => undefined);
  const parsed = matchPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const payload = parsed.data;

  const match = await prisma.match.findUnique({
    where: { id: context.params.id },
    include: {
      teams: true,
      participants: true
    }
  });

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  const playerIds = [...payload.team1, ...payload.team2];
  const players = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: { id: true }
  });
  if (players.length !== playerIds.length) {
    return NextResponse.json({ error: 'All players must exist' }, { status: 400 });
  }

  const newPlayedAt = payload.playedAt ? new Date(payload.playedAt) : match.playedAt;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.match.update({
      where: { id: match.id },
      data: {
        matchType: payload.matchType,
        status: MatchStatus.CONFIRMED,
        team1Score: payload.team1Score,
        team2Score: payload.team2Score,
        targetPoints: payload.targetPoints ?? 11,
        winByMargin: payload.winByMargin ?? 2,
        playedAt: newPlayedAt,
        location: payload.location,
        note: payload.note,
        confirmedById: admin.id,
        confirmedAt: new Date(),
        cancelledAt: null,
        disputeReason: null
      },
      include: { teams: true }
    });

    const team1 = updated.teams.find((team) => team.teamNo === 1);
    const team2 = updated.teams.find((team) => team.teamNo === 2);
    if (!team1 || !team2) {
      throw new Error('Match teams are missing');
    }

    await tx.matchParticipant.deleteMany({ where: { matchId: match.id } });
    await tx.matchParticipant.createMany({
      data: [
        ...payload.team1.map((userId) => ({ matchId: match.id, userId, teamId: team1.id })),
        ...payload.team2.map((userId) => ({ matchId: match.id, userId, teamId: team2.id }))
      ]
    });

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        matchId: match.id,
        message: 'MATCH_EDITED',
        metadata: payload as any
      }
    });
  });

  await recomputeLeague();

  return NextResponse.json({ status: 'UPDATED' });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  const admin = session?.user;
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const match = await prisma.match.findUnique({
    where: { id: context.params.id },
    select: {
      id: true,
      status: true
    }
  });

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  if (match.status === MatchStatus.CANCELLED) {
    return NextResponse.json({ status: 'ALREADY_CANCELLED' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.CANCELLED,
        cancelledAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        matchId: match.id,
        message: 'MATCH_CANCELLED'
      }
    });
  });

  await recomputeLeague();

  return NextResponse.json({ status: 'CANCELLED' });
}
