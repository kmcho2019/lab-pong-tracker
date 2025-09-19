import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { AllowlistManager } from '@/features/admin/allowlist-manager';
import { MatchManager } from '@/features/admin/match-manager';

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

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <h2 className="text-lg font-semibold">Allowlist</h2>
        <p className="text-sm text-slate-500">Only emails listed here can sign in.</p>
        <div className="mt-6">
          <AllowlistManager initialEntries={entries} />
        </div>
      </div>
      <MatchManager matches={serializedMatches} />
    </div>
  );
}
