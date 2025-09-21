'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import type { LeaderboardRow, LeaderboardMode } from '@/server/league-service';
import { formatDistanceToNow } from '@/utils/time';
import { findDuplicateDisplayNames, formatDisplayLabel } from '@/utils/name-format';

type TabMode = LeaderboardMode;

interface LeaderboardTabsProps {
  overall: LeaderboardRow[];
  singles: LeaderboardRow[];
  doubles: LeaderboardRow[];
}

export function LeaderboardTabs({ overall, singles, doubles }: LeaderboardTabsProps) {
  const [mode, setMode] = useState<TabMode>('overall');

  const uniqueUsers = useMemo(() => {
    const unique = new Map<string, { displayName: string }>();
    [overall, singles, doubles].forEach((rows) => {
      rows.forEach((row) => unique.set(row.id, { displayName: row.displayName }));
    });
    return Array.from(unique.values());
  }, [overall, singles, doubles]);

  const duplicateNames = useMemo(() => findDuplicateDisplayNames(uniqueUsers), [uniqueUsers]);

  const dataByMode = useMemo(
    () => ({
      overall,
      singles,
      doubles
    }),
    [overall, singles, doubles]
  );

  const activeRows = dataByMode[mode];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <div className="flex gap-2 text-xs">
          {(['overall', 'singles', 'doubles'] as TabMode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
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

      <table className="w-full table-auto text-sm">
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
          {activeRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 text-center text-slate-500">
                No {labelForMode(mode).toLowerCase()} matches yet.
              </td>
            </tr>
          ) : (
            activeRows.map((player, index) => (
              <tr key={player.id} className="border-t border-slate-100 last:border-b dark:border-slate-700">
                <td className="py-2 font-semibold">#{index + 1}</td>
                <td className="py-2">
                  <Link href={`/players/${player.username}`} className="text-blue-600 hover:underline">
                    {formatDisplayLabel(player.displayName, player.username, duplicateNames)}
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function labelForMode(mode: TabMode) {
  switch (mode) {
    case 'singles':
      return 'Singles';
    case 'doubles':
      return 'Doubles';
    default:
      return 'Overall';
  }
}
