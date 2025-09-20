'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useMemo } from 'react';
import { RatingSparkline } from '@/features/players/rating-sparkline';
import { formatDate } from '@/utils/time';
import type { RatingHistoryPoint } from '@/types/rating-history';
import type { ProfileMatch } from '@/types/player-profile';

type RatingMode = 'overall' | 'singles' | 'doubles';

interface PlayerRatingTabsProps {
  playerId: string;
  timeline: RatingHistoryPoint[];
  matches: ProfileMatch[];
  mode: RatingMode;
  onModeChange(mode: RatingMode): void;
}

export function PlayerRatingTabs({ playerId, timeline, matches, mode, onModeChange }: PlayerRatingTabsProps) {
  const timelineByMode = useMemo(
    () => ({
      overall: timeline,
      singles: timeline.filter((point) => point.matchInfo?.matchType === 'SINGLES'),
      doubles: timeline.filter((point) => point.matchInfo?.matchType === 'DOUBLES')
    }),
    [timeline]
  );

  const matchesByMode = useMemo(
    () => ({
      overall: matches,
      singles: matches.filter((match) => match.matchType === 'SINGLES'),
      doubles: matches.filter((match) => match.matchType === 'DOUBLES')
    }),
    [matches]
  );

  const records = useMemo(
    () => ({
      overall: computeRecord(matchesByMode.overall, playerId),
      singles: computeRecord(matchesByMode.singles, playerId),
      doubles: computeRecord(matchesByMode.doubles, playerId)
    }),
    [matchesByMode, playerId]
  );

  const activeTimeline = timelineByMode[mode];
  const activeMatches = matchesByMode[mode];
  const activeRecord = records[mode];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-300">
          <span className="font-semibold text-slate-700 dark:text-slate-100">{labelForMode(mode)} record:</span>{' '}
          {activeRecord.wins} - {activeRecord.losses}
        </div>
        <div className="flex gap-2 text-xs">
          {(['overall', 'singles', 'doubles'] as RatingMode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              className={clsx(
                'rounded-full px-3 py-1 font-semibold transition',
                mode === value
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              )}
            >
              {labelForMode(value)}
            </button>
          ))}
        </div>
      </div>

      <RatingSparkline history={activeTimeline} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[600px] table-auto text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Opponent(s)</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Rating</th>
            </tr>
          </thead>
          <tbody>
            {activeMatches.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                  No {labelForMode(mode).toLowerCase()} matches yet.
                </td>
              </tr>
            ) : (
              activeMatches.map((match) => {
                const team1 = match.participants.filter((participant) => participant.teamNo === 1);
                const team2 = match.participants.filter((participant) => participant.teamNo === 2);
                const playerOnTeam1 = team1.some((participant) => participant.userId === playerId);
                const playerParticipant = match.participants.find((participant) => participant.userId === playerId);
                const opponentTeam = playerOnTeam1 ? team2 : team1;
                const hasRatings =
                  typeof playerParticipant?.ratingBefore === 'number' &&
                  typeof playerParticipant?.ratingAfter === 'number';
                const beforeValue = hasRatings ? Number(playerParticipant?.ratingBefore) : null;
                const afterValue = hasRatings ? Number(playerParticipant?.ratingAfter) : null;
                const delta =
                  hasRatings && beforeValue !== null && afterValue !== null
                    ? Math.round(afterValue - beforeValue)
                    : null;

                return (
                  <tr key={match.id} className="border-t border-slate-100 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                    <td className="px-3 py-2 text-slate-500">{formatDate(match.playedAt)}</td>
                    <td className="px-3 py-2">
                      {opponentTeam.map((opponent) => (
                        <Link
                          key={opponent.userId}
                          href={`/players/${opponent.username}`}
                          className="block text-blue-500 hover:underline"
                        >
                          {opponent.displayName}
                        </Link>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      {match.team1Score} – {match.team2Score}
                    </td>
                    <td className="px-3 py-2">
                      {hasRatings && beforeValue !== null && afterValue !== null ? (
                        <div className="text-right">
                          <span className="text-slate-500 dark:text-slate-300">
                            {Math.round(beforeValue)} → {Math.round(afterValue)}
                          </span>
                          <span
                            className={clsx(
                              'ml-2 font-semibold',
                              delta === null
                                ? 'text-slate-400'
                                : delta >= 0
                                ? 'text-emerald-500'
                                : 'text-rose-500'
                            )}
                          >
                            {delta !== null && delta > 0 ? `+${delta}` : delta}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelForMode(mode: RatingMode) {
  switch (mode) {
    case 'singles':
      return 'Singles';
    case 'doubles':
      return 'Doubles';
    default:
      return 'Overall';
  }
}

function computeRecord(matches: ProfileMatch[], playerId: string) {
  let wins = 0;
  let losses = 0;

  matches.forEach((match) => {
    const team1 = match.participants.filter((participant) => participant.teamNo === 1);
    const team2 = match.participants.filter((participant) => participant.teamNo === 2);
    const playerOnTeam1 = team1.some((participant) => participant.userId === playerId);
    const didWin =
      (playerOnTeam1 ? match.team1Score : match.team2Score) >
      (playerOnTeam1 ? match.team2Score : match.team1Score);

    if (didWin) {
      wins += 1;
    } else {
      losses += 1;
    }
  });

  return { wins, losses };
}

export type { RatingMode };
