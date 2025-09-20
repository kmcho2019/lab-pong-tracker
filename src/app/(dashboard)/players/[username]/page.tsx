import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPlayerProfile } from '@/server/league-service';
import { PlayerProfileContent } from '@/features/players/player-profile-content';

interface PlayerPageProps {
  params: { username: string };
}

export const dynamic = 'force-dynamic';

export default async function PlayerPage({ params }: PlayerPageProps) {
  const profile = await getPlayerProfile(params.username);
  if (!profile) {
    notFound();
  }

  const { matches, headToHead, ratingTimeline, summary } = profile;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <PlayerProfileContent player={summary} timeline={ratingTimeline} matches={matches} />
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
