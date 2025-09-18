'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { z } from 'zod';
import { matchPayloadSchema } from '@/lib/validators';

interface UserOption {
  id: string;
  displayName: string;
  username: string;
  glickoRating: number;
}

export function SubmitMatchForm() {
  const [matchType, setMatchType] = useState<'SINGLES' | 'DOUBLES'>('SINGLES');
  const [team1, setTeam1] = useState<string[]>(['']);
  const [team2, setTeam2] = useState<string[]>(['']);
  const [team1Score, setTeam1Score] = useState(11);
  const [team2Score, setTeam2Score] = useState(9);
  const [target, setTarget] = useState(11);
  const [winBy, setWinBy] = useState(2);
  const [playedAt, setPlayedAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: usersData } = useQuery<{ users: UserOption[] }>({
    queryKey: ['players'],
    queryFn: async () => {
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error('Failed to load players');
      }
      return response.json();
    }
  });

  const players = usersData?.users ?? [];

  const matchMutation = useMutation({
    mutationFn: async () => {
      const sanitizedTeam1 = team1.filter(Boolean);
      const sanitizedTeam2 = team2.filter(Boolean);
      const duplicates = sanitizedTeam1.some((player) => sanitizedTeam2.includes(player));
      if (duplicates) {
        throw new Error('The same player cannot appear on both sides');
      }

      const payload = matchPayloadSchema.parse({
        matchType,
        team1: sanitizedTeam1,
        team2: sanitizedTeam2,
        team1Score,
        team2Score,
        targetPoints: target,
        winByMargin: winBy,
        playedAt: playedAt ? new Date(playedAt).toISOString() : undefined,
        location: location || undefined,
        note: note || undefined
      });
      const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to submit match');
      }
      return response.json();
    },
    onSuccess: () => {
      setSuccess('Match logged!');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (error: any) => {
      setSuccess(null);
      setError(error.message ?? 'Failed to submit match');
    }
  });

  const teamSlotCount = matchType === 'SINGLES' ? 1 : 2;

  useEffect(() => {
    setTeam1((previous) => {
      const next = Array(teamSlotCount).fill('');
      previous.slice(0, teamSlotCount).forEach((value, index) => {
        next[index] = value;
      });
      return next;
    });
    setTeam2((previous) => {
      const next = Array(teamSlotCount).fill('');
      previous.slice(0, teamSlotCount).forEach((value, index) => {
        next[index] = value;
      });
      return next;
    });
  }, [teamSlotCount]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        matchMutation.mutate();
      }}
    >
      <div className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm dark:bg-slate-700">
        {(['SINGLES', 'DOUBLES'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={clsx(
              'flex-1 rounded-full px-4 py-2 font-medium transition',
              matchType === option ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-500'
            )}
            onClick={() => setMatchType(option)}
          >
            {option === 'SINGLES' ? 'Singles' : 'Doubles'}
          </button>
        ))}
      </div>

      <TeamSelector
        title="Team 1"
        players={players}
        values={team1}
        onChange={setTeam1}
        slotCount={teamSlotCount}
      />

      <TeamSelector
        title="Team 2"
        players={players}
        values={team2}
        onChange={setTeam2}
        slotCount={teamSlotCount}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Team 1 score</span>
          <input
            type="number"
            min={0}
            value={team1Score}
            onChange={(event) => setTeam1Score(Number(event.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Team 2 score</span>
          <input
            type="number"
            min={0}
            value={team2Score}
            onChange={(event) => setTeam2Score(Number(event.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
        <summary className="cursor-pointer text-sm font-semibold">Advanced options</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Target points</span>
            <input
              type="number"
              min={1}
              max={21}
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Win-by margin</span>
            <input
              type="number"
              min={1}
              max={5}
              value={winBy}
              onChange={(event) => setWinBy(Number(event.target.value))}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Played at</span>
            <input
              type="datetime-local"
              value={playedAt}
              onChange={(event) => setPlayedAt(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Location</span>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Lab lounge"
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-sm">
            <span>Notes</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
        </div>
      </details>

      <div className="flex flex-col gap-2 text-sm">
        <button
          type="submit"
          disabled={matchMutation.isPending}
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-progress disabled:opacity-70"
        >
          {matchMutation.isPending ? 'Submitting…' : 'Submit match'}
        </button>
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-500">{success}</p> : null}
      </div>
    </form>
  );
}

interface TeamSelectorProps {
  title: string;
  players: UserOption[];
  values: string[];
  slotCount: number;
  onChange(values: string[]): void;
}

function TeamSelector({ title, players, values, slotCount, onChange }: TeamSelectorProps) {
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <legend className="px-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </legend>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {Array.from({ length: slotCount }).map((_, index) => (
          <label key={index} className="flex flex-col gap-1 text-sm">
            <span>Player {index + 1}</span>
            <select
              value={values[index] ?? ''}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName} · {Math.round(player.glickoRating)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
