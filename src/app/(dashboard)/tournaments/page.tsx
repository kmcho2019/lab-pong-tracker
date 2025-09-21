import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/time';
import { TournamentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function TournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startAt: 'asc' }
  });

  const now = new Date();
  const active = tournaments.filter((t) => t.status === TournamentStatus.ACTIVE);
  const upcoming = tournaments.filter((t) => t.status === TournamentStatus.SCHEDULED && t.startAt > now);
  const archive = tournaments.filter((t) => t.status === TournamentStatus.COMPLETED);

  return (
    <div className="space-y-8">
      <Section title="Active" tournaments={active} empty="No active tournaments." />
      <Section title="Upcoming" tournaments={upcoming} empty="No upcoming tournaments." />
      <Section title="Archive" tournaments={archive} empty="No tournaments in archive." />
    </div>
  );
}

function StatusBadge({ status }: { status: TournamentStatus }) {
  const classes = status === TournamentStatus.ACTIVE
    ? "bg-emerald-100 text-emerald-700"
    : status === TournamentStatus.SCHEDULED
      ? "bg-blue-100 text-blue-700"
      : status === TournamentStatus.COMPLETED
        ? "bg-slate-200 text-slate-700"
        : "bg-rose-100 text-rose-600";
  return <span className={`rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}>{status.toLowerCase()}</span>;
}

function Section({ title, tournaments, empty }: { title: string; tournaments: any[]; empty: string }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <h2 className="text-lg font-semibold">{title}</h2>
      {tournaments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-200">
          {tournaments.map((tournament) => (
            <li key={tournament.id} className="rounded border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/tournaments/${tournament.id}`} className="font-semibold text-blue-600 hover:underline">
                    {tournament.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <StatusBadge status={tournament.status} />
                    <span>{tournament.mode}</span>
                    <span>
                      {tournament.matchCountMode === 'PER_PLAYER'
                        ? `${tournament.matchesPerPlayer ?? '–'} match${(tournament.matchesPerPlayer ?? 0) === 1 ? '' : 'es'} / player`
                        : `${tournament.gamesPerGroup ?? '–'} games / group`}
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Start: {formatDate(tournament.startAt)}</div>
                  <div>End: {formatDate(tournament.endAt)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
