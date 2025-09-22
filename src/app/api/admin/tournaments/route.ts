import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TournamentFormat, TournamentMatchCountMode, TournamentMode } from '@prisma/client';
import { auth } from '@/server/auth';
import { createTournament, listTournaments } from '@/server/tournament-service';

const userIdSchema = z.string().min(1);

const createSchema = z.object({
  name: z.string().min(1),
  mode: z.nativeEnum(TournamentMode),
  format: z.nativeEnum(TournamentFormat).optional(),
  matchCountMode: z.nativeEnum(TournamentMatchCountMode).optional(),
  matchesPerPlayer: z.number().int().min(1).max(20).optional(),
  gamesPerGroup: z.number().int().min(1).max(200).optional(),
  roundRobinIterations: z.number().int().min(1).max(5).optional(),
  groupLabels: z.array(z.string().min(1)).min(1),
  participantIds: z.array(userIdSchema).min(2),
  startAt: z.string().datetime(),
  endAt: z.string().datetime()
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tournaments = await listTournaments();
  return NextResponse.json({ tournaments });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => undefined);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const matchCountMode = data.matchCountMode ?? TournamentMatchCountMode.PER_PLAYER;
  const matchesPerPlayer = data.matchesPerPlayer ?? 3;
  const gamesPerGroup = data.gamesPerGroup ?? 8;
  const format = data.format ?? TournamentFormat.STANDARD;
  const roundRobinIterations = data.roundRobinIterations ?? 1;

  const tournament = await createTournament({
    name: data.name,
    mode: data.mode,
    format,
    matchCountMode,
    matchesPerPlayer,
    gamesPerGroup,
    groupLabels: data.groupLabels,
    participantIds: data.participantIds,
    startAt: new Date(data.startAt),
    endAt: new Date(data.endAt),
    createdById: session.user.id,
    roundRobinIterations
  });

  return NextResponse.json({ tournament }, { status: 201 });
}
