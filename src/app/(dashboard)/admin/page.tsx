import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { AllowlistManager } from '@/features/admin/allowlist-manager';
import { MatchManager } from '@/features/admin/match-manager';
import { TournamentManager } from '@/features/admin/tournament-manager';
import { UserLifecycleManager } from '@/features/admin/user-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/');
  }

  const entries = await prisma.allowlistEmail.findMany({
    orderBy: { createdAt: 'desc' }
  });

  const matches = await prisma.match.findMany({
    where: { status: 'CONFIRMED' },
    orderBy: { playedAt: 'desc' },
    take: 20,
    include: {
      participants: {
        include: { user: true, team: true }
      }
    }
  });

  const serializedMatches = matches.map((match) => ({
    id: match.id,
    matchType: match.matchType,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    targetPoints: match.targetPoints,
    winByMargin: match.winByMargin,
    playedAt: match.playedAt.toISOString(),
    location: match.location,
    note: match.note,
    participants: match.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      username: participant.user.username,
      displayName: participant.user.displayName,
      teamNo: participant.team?.teamNo ?? 0
    }))
  }));

  const [players, members] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        singlesRating: true,
        doublesRating: true
      }
    }),
    prisma.user.findMany({
    orderBy: { displayName: 'asc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      active: true,
      lastMatchAt: true
    }
  })
  ]);

  const tournaments = await prisma.tournament.findMany({
    orderBy: { startAt: 'desc' },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              singlesRating: true,
              doublesRating: true
            }
          }
        }
      },
      groups: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true
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
                  playedAt: true,
                  location: true,
                  note: true
                }
              }
            }
          }
        }
      }
    }
  });

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <h2 className="text-lg font-semibold">Allowlist</h2>
        <p className="text-sm text-slate-500">Only emails listed here can sign in.</p>
        <div className="mt-6">
          <AllowlistManager initialEntries={entries} />
        </div>
      </div>
      <UserLifecycleManager
        users={members.map((member) => ({
          id: member.id,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
          active: member.active,
          lastMatchAt: member.lastMatchAt ? member.lastMatchAt.toISOString() : null
        }))}
      />
      <MatchManager matches={serializedMatches} />
      <TournamentManager
        players={players.map((player) => ({
          ...player,
          singlesRating: player.singlesRating ?? 1500,
          doublesRating: player.doublesRating ?? 1500
        }))}
        tournaments={tournaments.map((tournament) => ({
          id: tournament.id,
          name: tournament.name,
          mode: tournament.mode,
          status: tournament.status,
          matchCountMode: tournament.matchCountMode,
          matchesPerPlayer: tournament.matchesPerPlayer ?? null,
          gamesPerGroup: tournament.gamesPerGroup ?? null,
          startAt: tournament.startAt.toISOString(),
          endAt: tournament.endAt.toISOString(),
          participants: tournament.participants.map((participant) => ({
            id: participant.id,
            userId: participant.userId,
            user: {
              id: participant.user.id,
              username: participant.user.username,
              displayName: participant.user.displayName,
              singlesRating: participant.user.singlesRating ?? 1500,
              doublesRating: participant.user.doublesRating ?? 1500
            }
          })),
          groups: tournament.groups.map((group) => ({
            id: group.id,
            name: group.name,
            tableLabel: group.tableLabel,
            participants: group.participants.map((participant) => ({
              userId: participant.userId,
              user: participant.user
            })),
            matchups: group.matchups.map((matchup) => ({
              id: matchup.id,
              groupId: group.id,
              team1Ids: matchup.team1Ids,
              team2Ids: matchup.team2Ids,
              status: matchup.status,
              scheduledAt: matchup.scheduledAt ? matchup.scheduledAt.toISOString() : null,
              resultMatch: matchup.resultMatch
                ? {
                    id: matchup.resultMatch.id,
                    team1Score: matchup.resultMatch.team1Score,
                    team2Score: matchup.resultMatch.team2Score,
                    playedAt: matchup.resultMatch.playedAt ? matchup.resultMatch.playedAt.toISOString() : null,
                    location: matchup.resultMatch.location,
                    note: matchup.resultMatch.note
                  }
                : null
            }))
          }))
        }))}
      />
    </div>
  );
}
