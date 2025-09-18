import { NextResponse } from 'next/server';
import { MatchStatus } from '@prisma/client';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';

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

  const payload = await request.json().catch(() => ({}));
  const reason = typeof payload?.reason === 'string' ? payload.reason.slice(0, 280) : null;

  const match = await prisma.match.findUnique({
    where: { id: context.params.id },
    include: {
      participants: true
    }
  });

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  const isParticipant = match.participants.some((participant) => participant.userId === session.user.id);
  const isAdmin = session.user.role === 'ADMIN';

  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: 'Only participants can dispute matches' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: match.id },
      data: {
        status: MatchStatus.DISPUTED,
        disputeReason: reason ?? undefined
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        matchId: match.id,
        message: 'MATCH_DISPUTED',
        metadata: reason ? { reason } : undefined
      }
    });
  });

  return NextResponse.json({ status: 'DISPUTED' });
}
