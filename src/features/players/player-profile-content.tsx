'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlayerRatingTabs, type RatingMode } from '@/features/players/player-rating-tabs';
import type { RatingHistoryPoint } from '@/types/rating-history';
import type { ProfileMatch } from '@/types/player-profile';
import { formatDate } from '@/utils/time';

interface ModeSummary {
  rating: number;
  rd: number;
  wins: number;
  losses: number;
  lastMatchAt: string | null;
}

interface PlayerProfileContentProps {
  summary: {
    id: string;
    displayName: string;
    username: string;
    glickoRating: number;
    glickoRd: number;
    wins: number;
    losses: number;
    lastMatchAt: string | null;
    singlesRating: number;
    singlesRd: number;
    singlesWins: number;
    singlesLosses: number;
    singlesLastMatchAt: string | null;
    doublesRating: number;
    doublesRd: number;
    doublesWins: number;
    doublesLosses: number;
    doublesLastMatchAt: string | null;
  };
  timeline: RatingHistoryPoint[];
  matches: ProfileMatch[];
}

export function PlayerProfileContent({ summary, timeline, matches }: PlayerProfileContentProps) {
  const [mode, setMode] = useState<RatingMode>('overall');

  const summaries: Record<RatingMode, ModeSummary> = useMemo(
    () => ({
      overall: {
        rating: summary.glickoRating,
        rd: summary.glickoRd,
        wins: summary.wins,
        losses: summary.losses,
        lastMatchAt: summary.lastMatchAt
      },
      singles: {
        rating: summary.singlesRating,
        rd: summary.singlesRd,
        wins: summary.singlesWins,
        losses: summary.singlesLosses,
        lastMatchAt: summary.singlesLastMatchAt
      },
      doubles: {
        rating: summary.doublesRating,
        rd: summary.doublesRd,
        wins: summary.doublesWins,
        losses: summary.doublesLosses,
        lastMatchAt: summary.doublesLastMatchAt
      }
    }),
    [summary]
  );

  const activeSummary = summaries[mode];
  const winPercent = activeSummary.wins + activeSummary.losses > 0
    ? ((activeSummary.wins / (activeSummary.wins + activeSummary.losses)) * 100).toFixed(1)
    : '—';

  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{summary.displayName}</h2>
          <p className="text-sm text-slate-500">@{summary.username}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-300">{Math.round(activeSummary.rating)}</p>
          <p className="text-xs uppercase tracking-wide text-slate-400">RD {activeSummary.rd.toFixed(0)}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-4 md:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Wins</dt>
          <dd className="text-lg font-semibold">{activeSummary.wins}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Losses</dt>
          <dd className="text-lg font-semibold">{activeSummary.losses}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Win %</dt>
          <dd className="text-lg font-semibold">{winPercent}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Last match</dt>
          <dd className="text-lg font-semibold">{formatDate(activeSummary.lastMatchAt)}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <PlayerRatingTabs
          playerId={summary.id}
          timeline={timeline}
          matches={matches}
          mode={mode}
          onModeChange={setMode}
        />
      </div>
    </section>
  );
}
