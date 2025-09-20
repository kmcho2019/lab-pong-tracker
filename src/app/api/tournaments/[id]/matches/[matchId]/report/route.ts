import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/server/auth';
import { reportTournamentMatch } from '@/server/tournament-service';

const reportSchema = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
  targetPoints: z.number().int().min(1).max(21).optional(),
  winByMargin: z.number().int().min(1).max(5).optional(),
  location: z.string().max(120).optional(),
  note: z.string().max(280).optional()
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string; matchId: string };
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => undefined);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const match = await reportTournamentMatch({
      reporterId: session.user.id,
      tournamentId: context.params.id,
      tournamentMatchId: context.params.matchId,
      team1Score: parsed.data.team1Score,
      team2Score: parsed.data.team2Score,
      targetPoints: parsed.data.targetPoints,
      winByMargin: parsed.data.winByMargin,
      location: parsed.data.location,
      note: parsed.data.note
    });

    return NextResponse.json({ match }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Unable to report match' }, { status: 400 });
  }
}
