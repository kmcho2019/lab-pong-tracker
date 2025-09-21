import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TournamentMatchStatus, TournamentStatus } from '@prisma/client';
import { auth } from '@/server/auth';
import { getTournamentDetail, updateTournamentStructure } from '@/server/tournament-service';

const userIdSchema = z.string().min(1);

const updateSchema = z.object({
  status: z.nativeEnum(TournamentStatus).optional(),
  groups: z
    .array(
      z.object({
        id: z.string().cuid(),
        name: z.string().min(1),
        tableLabel: z.string().min(1),
        participantIds: z.array(userIdSchema)
      })
    )
    .optional(),
  matches: z
    .array(
      z.object({
        id: z.string().cuid(),
        groupId: z.string().cuid(),
        team1Ids: z.array(userIdSchema).min(1),
        team2Ids: z.array(userIdSchema).min(1),
        scheduledAt: z.string().datetime().nullable().optional(),
        status: z.nativeEnum(TournamentMatchStatus).optional()
      })
    )
    .optional()
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tournament = await getTournamentDetail(context.params.id);
  if (!tournament) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({ tournament });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => undefined);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const payload = parsed.data;
  await updateTournamentStructure(context.params.id, {
    status: payload.status,
    groups: payload.groups?.map((group) => ({
      id: group.id,
      name: group.name,
      tableLabel: group.tableLabel,
      participantIds: group.participantIds
    })),
    matches: payload.matches?.map((match) => ({
      id: match.id,
      groupId: match.groupId,
      team1Ids: match.team1Ids,
      team2Ids: match.team2Ids,
      scheduledAt: match.scheduledAt ? new Date(match.scheduledAt) : null,
      status: match.status
    }))
  });

  const tournament = await getTournamentDetail(context.params.id);
  return NextResponse.json({ tournament });
}
