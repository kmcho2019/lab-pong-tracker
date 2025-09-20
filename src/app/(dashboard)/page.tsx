import Link from 'next/link';
import { getLeaderboard, getRecentMatches } from '@/server/league-service';
import { formatDistanceToNow } from '@/utils/time';
import { LeaderboardTabs } from '@/features/leaderboard/leaderboard-tabs';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const [overall, singles, doubles, matches] = await Promise.all([
    getLeaderboard('active', 'overall'),
    getLeaderboard('active', 'singles'),
    getLeaderboard('active', 'doubles'),
    getRecentMatches(10)
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <LeaderboardTabs overall={overall} singles={singles} doubles={doubles} />
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
