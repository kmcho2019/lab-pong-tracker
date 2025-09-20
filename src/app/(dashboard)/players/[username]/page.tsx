import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPlayerProfile } from '@/server/league-service';
import { PlayerRatingTabs } from '@/features/players/player-rating-tabs';
import { formatDate } from '@/utils/time';

interface PlayerPageProps {
  params: { username: string };
}

export const dynamic = 'force-dynamic';

export default async function PlayerPage({ params }: PlayerPageProps) {
  const profile = await getPlayerProfile(params.username);
  if (!profile) {
    notFound();
  }

  const { player, matches, headToHead, ratingTimeline } = profile;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{player.displayName}</h2>
            <p className="text-sm text-slate-500">@{player.username}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-300">
              {Math.round(player.glickoRating)}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-400">RD {player.glickoRd.toFixed(0)}</p>
          </div>
        </div>

        <dl className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Wins</dt>
            <dd className="text-lg font-semibold">{player.wins}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Losses</dt>
            <dd className="text-lg font-semibold">{player.losses}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Win %</dt>
            <dd className="text-lg font-semibold">
              {player.wins + player.losses > 0
                ? ((player.wins / (player.wins + player.losses)) * 100).toFixed(1)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Last match</dt>
            <dd className="text-lg font-semibold">{formatDate(player.lastMatchAt)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <PlayerRatingTabs playerId={player.id} timeline={ratingTimeline} matches={matches} />
        </div>
      </section>
      <aside className="flex flex-col gap-6">
        <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <h3 className="text-lg font-semibold">Head-to-head</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {headToHead.length === 0 ? (
              <li className="text-slate-500">No matches yet.</li>
            ) : (
              headToHead.map((record) => (
                <li key={record.opponent.id} className="flex justify-between rounded-lg bg-slate-100 px-3 py-2 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                  <Link href={`/players/${record.opponent.username}`} className="font-medium hover:underline">
                    {record.opponent.displayName}
                  </Link>
                  <div className="text-right">
                    <span className="font-semibold">{record.wins}-{record.losses}</span>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Singles {record.singlesWins}-{record.singlesLosses}</div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </aside>
    </div>
  );
}
