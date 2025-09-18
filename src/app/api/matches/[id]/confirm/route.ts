import { NextResponse } from 'next/server';
import { MatchStatus } from '@prisma/client';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { applyRatingsForMatch } from '@/server/rating-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const currentUser = session.user;

  const match = await prisma.match.findUnique({
    where: { id: context.params.id },
    include: {
      participants: {
        include: { user: true }
      }
    }
  });

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  if (match.status !== MatchStatus.PENDING) {
    return NextResponse.json({ error: 'Match is not pending confirmation' }, { status: 409 });
  }

  const isParticipant = match.participants.some((participant) => participant.userId === currentUser.id);
  const isAdmin = currentUser.role === 'ADMIN';

  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: 'Only participants can confirm matches' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.CONFIRMED,
        confirmedById: currentUser.id,
        confirmedAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: currentUser.id,
        matchId: match.id,
        message: 'MATCH_CONFIRMED'
      }
    });
  });

  await applyRatingsForMatch(match.id);

  return NextResponse.json({ status: 'CONFIRMED' });
}
