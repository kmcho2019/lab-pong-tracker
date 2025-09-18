import Link from 'next/link';
import { getLeaderboard, getRecentMatches } from '@/server/league-service';
import { formatDistanceToNow } from '@/utils/time';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const [leaders, matches] = await Promise.all([getLeaderboard('active'), getRecentMatches(10)]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <h2 className="text-lg font-semibold">Current Elo Leaderboard</h2>
        <table className="mt-4 w-full table-auto text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="pb-2">Rank</th>
              <th className="pb-2">Player</th>
              <th className="pb-2">Rating</th>
              <th className="pb-2">RD</th>
              <th className="pb-2">Record</th>
              <th className="pb-2">Last played</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((player, index) => (
              <tr key={player.id} className="border-t border-slate-100 last:border-b dark:border-slate-700">
                <td className="py-2 font-semibold">#{index + 1}</td>
                <td className="py-2">
                  <Link href={`/players/${player.username}`} className="text-blue-600 hover:underline">
                    {player.displayName}
                  </Link>
                </td>
                <td className="py-2">{Math.round(player.glickoRating)}</td>
                <td className="py-2">{player.glickoRd.toFixed(0)}</td>
                <td className="py-2">
                  {player.wins} - {player.losses}
                </td>
                <td className="py-2 text-slate-500">
                  {player.lastMatchAt ? formatDistanceToNow(player.lastMatchAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Matches</h2>
          <Link href="/history" className="text-sm text-blue-500 hover:underline">
            View all
          </Link>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-200">
          {matches.map((match) => {
            const team1 = match.participants.filter((p) => p.team?.teamNo === 1);
            const team2 = match.participants.filter((p) => p.team?.teamNo === 2);
            return (
              <li key={match.id} className="rounded-xl bg-slate-100/70 px-3 py-2 dark:bg-slate-700/70">
                <div className="font-medium text-slate-900 dark:text-white">
                  {team1.map((p) => p.user.displayName).join(' / ')}
                  <span className="mx-2 text-xs uppercase text-slate-400">vs</span>
                  {team2.map((p) => p.user.displayName).join(' / ')}
                </div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-300">
                  <span>
                    {match.team1Score} – {match.team2Score}
                  </span>
                  <span>{formatDistanceToNow(match.playedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
