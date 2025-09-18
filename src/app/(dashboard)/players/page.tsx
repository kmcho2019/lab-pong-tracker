import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const players = await prisma.user.findMany({
    where: { active: true },
    orderBy: [{ glickoRating: 'desc' }],
    include: {
      ratingHistory: {
        orderBy: { playedAt: 'desc' },
        take: 1
      }
    }
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <h2 className="text-lg font-semibold">Players</h2>
      <p className="text-sm text-slate-500">Tap a name to view their profile.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {players.map((player) => (
          <Link
            key={player.id}
            href={`/players/${player.username}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow hover:border-blue-400 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold">{player.displayName}</p>
                <p className="text-xs text-slate-500">@{player.username}</p>
              </div>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                {Math.round(player.glickoRating)}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
              <div>
                <dt className="uppercase tracking-wide text-slate-400">Wins</dt>
                <dd className="font-semibold">{player.wins}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-slate-400">Losses</dt>
                <dd className="font-semibold">{player.losses}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-slate-400">RD</dt>
                <dd className="font-semibold">{player.glickoRd.toFixed(0)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}
