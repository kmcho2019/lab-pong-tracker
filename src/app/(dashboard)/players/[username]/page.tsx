import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPlayerProfile } from '@/server/league-service';
import { RatingSparkline } from '@/features/players/rating-sparkline';
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
          <RatingSparkline history={ratingTimeline} />
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold">Recent Matches</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] table-auto text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Opponent(s)</th>
                  <th className="pb-2">Score</th>
                  <th className="pb-2">Rating</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const team1 = match.participants.filter((participant) => participant.team?.teamNo === 1);
                  const team2 = match.participants.filter((participant) => participant.team?.teamNo === 2);
                  const playerOnTeam1 = team1.some((participant) => participant.userId === player.id);
                  const playerParticipant = match.participants.find((participant) => participant.userId === player.id);
                  const opponentTeam = playerOnTeam1 ? team2 : team1;
                  const hasRatings = typeof playerParticipant?.ratingBefore === 'number' && typeof playerParticipant?.ratingAfter === 'number';
                  const beforeValue = hasRatings ? Number(playerParticipant?.ratingBefore) : null;
                  const afterValue = hasRatings ? Number(playerParticipant?.ratingAfter) : null;
                  const delta = hasRatings && beforeValue !== null && afterValue !== null ? Math.round(afterValue - beforeValue) : null;

                  return (
                    <tr key={match.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-2 text-slate-500">{formatDate(match.playedAt)}</td>
                      <td className="py-2">
                        {opponentTeam.map((opponent) => (
                          <Link
                            key={opponent.userId}
                            href={`/players/${opponent.user.username}`}
                            className="block text-blue-500 hover:underline"
                          >
                            {opponent.user.displayName}
                          </Link>
                        ))}
                      </td>
                      <td className="py-2">
                        {match.team1Score} – {match.team2Score}
                      </td>
                      <td className="py-2">
                        {hasRatings && beforeValue !== null && afterValue !== null ? (
                          <div className="text-right">
                            <span className="text-slate-500 dark:text-slate-300">
                              {Math.round(beforeValue)} → {Math.round(afterValue)}
                            </span>
                            <span className={`ml-2 font-semibold ${delta === null ? 'text-slate-400' : delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {delta !== null && delta > 0 ? `+${delta}` : delta}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
