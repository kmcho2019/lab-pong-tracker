import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/time';
import Link from 'next/link';

interface HistoryPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export const dynamic = 'force-dynamic';

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const player = typeof searchParams.player === 'string' ? searchParams.player : undefined;

  const matches = await prisma.match.findMany({
    where: {
      status: 'CONFIRMED',
      ...(player
        ? {
            participants: {
              some: {
                OR: [{ userId: player }, { user: { username: player } }]
              }
            }
          }
        : {})
    },
    orderBy: { playedAt: 'desc' },
    take: 200,
    include: {
      participants: {
        include: { user: true, team: true }
      }
    }
  });

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { displayName: 'asc' },
    select: {
      id: true,
      username: true,
      displayName: true
    }
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Match History</h2>
          <p className="text-sm text-slate-500">Confirmed matches, most recent first</p>
        </div>
        <form className="flex gap-2 text-sm" method="get">
          <label className="sr-only" htmlFor="player-filter">
            Filter by player
          </label>
          <select
            id="player-filter"
            name="player"
            defaultValue={player ?? ''}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-700"
          >
            <option value="">All players</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white shadow hover:bg-blue-500"
          >
            Apply
          </button>
        </form>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] table-auto text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="pb-2">Date</th>
              <th className="pb-2">Matchup</th>
              <th className="pb-2">Score</th>
              <th className="pb-2">Rating Δ</th>
              <th className="pb-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const team1 = match.participants.filter((p) => p.team?.teamNo === 1);
              const team2 = match.participants.filter((p) => p.team?.teamNo === 2);
              const winners = match.team1Score > match.team2Score ? team1 : team2;
              const losers = match.team1Score > match.team2Score ? team2 : team1;

              return (
                <tr key={match.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 text-slate-500">{formatDate(match.playedAt)}</td>
                  <td className="py-2">
                    <div className="flex flex-col">
                      <span className="font-semibold text-emerald-500">
                        {winners.map((p) => p.user.displayName).join(' / ')}
                      </span>
                      <span className="text-slate-500 dark:text-slate-300">
                        {losers.map((p) => p.user.displayName).join(' / ')}
                      </span>
                    </div>
                  </td>
                  <td className="py-2">
                    {match.team1Score} – {match.team2Score}
                  </td>
                  <td className="py-2">
                    {team1.concat(team2).map((participant) => (
                      <div key={participant.id} className="flex justify-between">
                        <Link href={`/players/${participant.user.username}`} className="text-blue-500 hover:underline">
                          {participant.user.displayName}
                        </Link>
                        <span className={participant.ratingAfter && participant.ratingBefore && participant.ratingAfter >= participant.ratingBefore ? 'text-emerald-500' : 'text-rose-500'}>
                          {participant.ratingAfter && participant.ratingBefore
                            ? Math.round(participant.ratingAfter - participant.ratingBefore)
                            : '—'}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="py-2 text-slate-500">{match.location ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
