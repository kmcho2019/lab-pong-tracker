'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { formatDate, toLeagueIso, LEAGUE_TIMEZONE, leagueDayjs } from '@/utils/time';
import { findDuplicateDisplayNames, formatDisplayLabel } from '@/utils/name-format';

export interface AdminMatchParticipant {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  teamNo: number;
}

export interface AdminMatch {
  id: string;
  matchType: 'SINGLES' | 'DOUBLES';
  team1Score: number;
  team2Score: number;
  targetPoints: number;
  winByMargin: number;
  playedAt: string;
  location: string | null;
  note: string | null;
  participants: AdminMatchParticipant[];
}

interface MatchManagerProps {
  matches: AdminMatch[];
}

interface MatchFormState {
  team1: string;
  team2: string;
  team1Score: number;
  team2Score: number;
  matchType: 'SINGLES' | 'DOUBLES';
  targetPoints: number;
  winByMargin: number;
  playedAt: string;
  location: string;
  note: string;
}

export function MatchManager({ matches }: MatchManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string | null>(null);
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  const [openMatches, setOpenMatches] = useState<Set<string>>(() => new Set());

  const duplicateNames = useMemo(() => {
    const participants = matches.flatMap((match) => match.participants.map((participant) => participant.displayName));
    return findDuplicateDisplayNames(participants.map((displayName) => ({ displayName })));
  }, [matches]);

  const initialState = useMemo(() => {
    const map = new Map<string, MatchFormState>();
    matches.forEach((match) => {
      const team1Ids = match.participants
        .filter((participant) => participant.teamNo === 1)
        .map((participant) => participant.userId)
        .join(',');
      const team2Ids = match.participants
        .filter((participant) => participant.teamNo === 2)
        .map((participant) => participant.userId)
        .join(',');
      const playedAtLocal = leagueDayjs(match.playedAt).tz(LEAGUE_TIMEZONE).format('YYYY-MM-DDTHH:mm');
      map.set(match.id, {
        team1: team1Ids,
        team2: team2Ids,
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        matchType: match.matchType,
        targetPoints: match.targetPoints,
        winByMargin: match.winByMargin,
        playedAt: playedAtLocal,
        location: match.location ?? '',
        note: match.note ?? ''
      });
    });
    return map;
  }, [matches]);

  const [formState, setFormState] = useState(initialState);

  const handleFieldChange = (matchId: string, field: keyof MatchFormState, value: string) => {
    setFormState((prev) => {
      const next = new Map(prev);
      const baseline = next.get(matchId) ?? initialState.get(matchId);
      if (!baseline) return prev;
      const numericFields: Array<keyof MatchFormState> = ['team1Score', 'team2Score', 'targetPoints', 'winByMargin'];
      const parsedValue = numericFields.includes(field) ? Number(value) : value;
      next.set(matchId, {
        ...baseline,
        [field]: parsedValue as MatchFormState[keyof MatchFormState]
      });
      return next;
    });
  };

  const handleUpdate = (matchId: string) => {
    const current = formState.get(matchId) ?? initialState.get(matchId);
    if (!current) return;
    const payload = {
      matchType: current.matchType,
      team1: current.team1.split(',').map((value) => value.trim()).filter(Boolean),
      team2: current.team2.split(',').map((value) => value.trim()).filter(Boolean),
      team1Score: Number(current.team1Score),
      team2Score: Number(current.team2Score),
      targetPoints: Number(current.targetPoints),
      winByMargin: Number(current.winByMargin),
      playedAt: current.playedAt ? toLeagueIso(current.playedAt) : undefined,
      location: current.location || undefined,
      note: current.note || undefined
    };

    setErrors(null);
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        setErrors(errorBody.error ? JSON.stringify(errorBody.error) : 'Failed to update match');
        return;
      }
      setMessage('Match updated and ratings recomputed.');
      router.refresh();
    });
  };

  const handleCancel = (matchId: string) => {
    if (!confirm('Cancel this match and recompute ratings?')) {
      return;
    }
    setErrors(null);
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/matches/${matchId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        setErrors(errorBody.error ? JSON.stringify(errorBody.error) : 'Failed to cancel match');
        return;
      }
      setMessage('Match cancelled. Ratings recomputed.');
      router.refresh();
    });
  };

  const toggleAllMatches = (forceOpen: boolean) => {
    setOpenMatches(() => {
      if (forceOpen) {
        return new Set(matches.map((match) => match.id));
      }
      return new Set();
    });
  };

  return (
    <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Match Management</h2>
          <p className="text-sm text-slate-500">Edit or cancel confirmed matches. Ratings recompute automatically.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {matches.length > 0 && !sectionCollapsed ? (
            <>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                onClick={() => toggleAllMatches(openMatches.size !== matches.length)}
              >
                {openMatches.size === matches.length ? 'Collapse all matches' : 'Expand all matches'}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            onClick={() => {
              setSectionCollapsed((previous) => {
                const next = !previous;
                if (next) {
                  setOpenMatches(new Set());
                }
                return next;
              });
            }}
          >
            {sectionCollapsed ? 'Show matches' : 'Hide matches'}
          </button>
        </div>
      </div>
      {message ? <div className="mt-4 rounded bg-emerald-100 px-3 py-2 text-emerald-700">{message}</div> : null}
      {errors ? <div className="mt-4 rounded bg-rose-100 px-3 py-2 text-rose-700">{errors}</div> : null}
      {!sectionCollapsed && (
        <div className="mt-6 space-y-6">
        {matches.length === 0 ? (
          <p className="text-sm text-slate-500">No confirmed matches found.</p>
        ) : (
          matches.map((match) => {
            const participantsByTeam = [
              match.participants.filter((participant) => participant.teamNo === 1),
              match.participants.filter((participant) => participant.teamNo === 2)
            ];
            const state = formState.get(match.id) ?? initialState.get(match.id);
            return (
              <details
                key={match.id}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                open={openMatches.has(match.id)}
                onToggle={(event) => {
                  const isOpen = (event.target as HTMLDetailsElement).open;
                  setOpenMatches((prev) => {
                    const next = new Set(prev);
                    if (isOpen) {
                      next.add(match.id);
                    } else {
                      next.delete(match.id);
                    }
                    return next;
                  });
                }}
              >
            <summary className="cursor-pointer text-sm font-semibold">
                  {formatDate(match.playedAt)} ·
                  {' '}
                  {participantsByTeam[0]
                    .map((p) => formatDisplayLabel(p.displayName, p.username, duplicateNames))
                    .join(' / ')}{' '}
                  vs{' '}
                  {participantsByTeam[1]
                    .map((p) => formatDisplayLabel(p.displayName, p.username, duplicateNames))
                    .join(' / ')}{' '}
                  · {match.team1Score} – {match.team2Score}
                </summary>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Match type</span>
                      <select
                        value={state?.matchType ?? match.matchType}
                        onChange={(event) => handleFieldChange(match.id, 'matchType', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                      >
                        <option value="SINGLES">Singles</option>
                        <option value="DOUBLES">Doubles</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Played at (KST)</span>
                      <input
                        type="datetime-local"
                        value={state?.playedAt ?? ''}
                        onChange={(event) => handleFieldChange(match.id, 'playedAt', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Team 1 player IDs (comma separated)</span>
                      <input
                        type="text"
                        value={state?.team1 ?? ''}
                        onChange={(event) => handleFieldChange(match.id, 'team1', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-700"
                      />
                      <span className="text-xs text-slate-500">
                        {participantsByTeam[0]
                          .map((participant) =>
                            `${formatDisplayLabel(participant.displayName, participant.username, duplicateNames)} (${participant.userId})`
                          )
                          .join(', ')}
                      </span>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Team 2 player IDs (comma separated)</span>
                      <input
                        type="text"
                        value={state?.team2 ?? ''}
                        onChange={(event) => handleFieldChange(match.id, 'team2', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-700"
                      />
                      <span className="text-xs text-slate-500">
                        {participantsByTeam[1]
                          .map((participant) =>
                            `${formatDisplayLabel(participant.displayName, participant.username, duplicateNames)} (${participant.userId})`
                          )
                          .join(', ')}
                      </span>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Team 1 score</span>
                      <input
                        type="number"
                        min={0}
                        value={state?.team1Score ?? match.team1Score}
                        onChange={(event) => handleFieldChange(match.id, 'team1Score', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Team 2 score</span>
                      <input
                        type="number"
                        min={0}
                        value={state?.team2Score ?? match.team2Score}
                        onChange={(event) => handleFieldChange(match.id, 'team2Score', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Target points</span>
                      <input
                        type="number"
                        min={1}
                        max={21}
                        value={state?.targetPoints ?? match.targetPoints}
                        onChange={(event) => handleFieldChange(match.id, 'targetPoints', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Win-by margin</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={state?.winByMargin ?? match.winByMargin}
                        onChange={(event) => handleFieldChange(match.id, 'winByMargin', event.target.value)}
                        className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Location</span>
                    <input
                      type="text"
                      value={state?.location ?? ''}
                      onChange={(event) => handleFieldChange(match.id, 'location', event.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Notes</span>
                    <textarea
                      value={state?.note ?? ''}
                      onChange={(event) => handleFieldChange(match.id, 'note', event.target.value)}
                      rows={2}
                      className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                    />
                  </label>
                  <div className="flex justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleCancel(match.id)}
                      className="rounded-lg border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      disabled={isPending}
                    >
                      Cancel match
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate(match.id)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-60"
                      disabled={isPending}
                    >
                      {isPending ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </details>
            );
          })
        )}
        </div>
      )}
    </div>
  );
}
