import { NextResponse } from 'next/server';
import { TournamentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const now = new Date();
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startAt: 'asc' },
    include: {
      groups: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  username: true
                }
              }
            }
          },
          matchups: {
            orderBy: { createdAt: 'asc' },
            include: {
              resultMatch: {
                select: {
                  id: true,
                  team1Score: true,
                  team2Score: true,
                  playedAt: true
                }
              }
            }
          }
        }
      }
    }
  });

  const active = tournaments.filter((t) => t.status === TournamentStatus.ACTIVE);
  const upcoming = tournaments.filter((t) => t.status === TournamentStatus.SCHEDULED && t.startAt > now);
  const completed = tournaments.filter((t) => t.status === TournamentStatus.COMPLETED);

  return NextResponse.json({ active, upcoming, completed });
}
