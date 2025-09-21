'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import {
  TournamentMatchCountMode,
  TournamentMatchStatus,
  TournamentMode,
  TournamentStatus
} from '@prisma/client';
import { formatDate, leagueDayjs, toLeagueIso } from '@/utils/time';
import { findDuplicateDisplayNames, formatDisplayLabel } from '@/utils/name-format';

interface AdminPlayer {
  id: string;
  username: string;
  displayName: string;
  singlesRating: number;
  doublesRating: number;
}

type ParticipantLookup = Map<string, { displayName: string; username: string }>;

interface AdminTournamentParticipant {
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    singlesRating?: number | null;
    doublesRating?: number | null;
  };
}

interface AdminTournamentMatch {
  id: string;
  groupId: string;
  team1Ids: string[];
  team2Ids: string[];
  status: TournamentMatchStatus;
  scheduledAt: string | null;
  resultMatch?: {
    id: string;
    team1Score: number;
    team2Score: number;
    playedAt: string | null;
    location: string | null;
    note: string | null;
  } | null;
}

interface AdminTournamentGroup {
  id: string;
  name: string;
  tableLabel: string;
  participants: AdminTournamentParticipant[];
  matchups: AdminTournamentMatch[];
}

interface AdminTournament {
  id: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  matchCountMode: TournamentMatchCountMode;
  matchesPerPlayer: number | null;
  gamesPerGroup: number | null;
  startAt: string;
  endAt: string;
  participants: AdminTournamentParticipant[];
  groups: AdminTournamentGroup[];
}

interface TournamentManagerProps {
  players: AdminPlayer[];
  tournaments: AdminTournament[];
  duplicateNames: string[];
}

interface CreateFormState {
  name: string;
  mode: TournamentMode;
  startAt: string;
  endAt: string;
  groupCount: number;
  matchCountMode: TournamentMatchCountMode;
  matchesPerPlayer: number;
  gamesPerGroup: number;
  selectedIds: Set<string>;
}

type DraftTournament = {
  id: string;
  status: TournamentStatus;
  matchCountMode: TournamentMatchCountMode;
  matchesPerPlayer: number | null;
  gamesPerGroup: number | null;
  groups: DraftGroup[];
};

type DraftGroup = {
  id: string;
  name: string;
  tableLabel: string;
  participantIds: string[];
  matches: DraftMatch[];
};

type DraftMatch = {
  id: string;
  team1Ids: string[];
  team2Ids: string[];
  scheduledAt: string | null;
  status: TournamentMatchStatus;
};

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function TournamentManager({ players, tournaments, duplicateNames }: TournamentManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const defaultStart = useMemo(() => leagueDayjs().add(30, 'minute').format('YYYY-MM-DDTHH:mm'), []);
  const defaultEnd = useMemo(() => leagueDayjs().add(4, 'hour').format('YYYY-MM-DDTHH:mm'), []);
  const [form, setForm] = useState<CreateFormState>({
    name: '',
    mode: TournamentMode.SINGLES,
    startAt: defaultStart,
    endAt: defaultEnd,
    groupCount: Math.min(2, alphabet.length),
    matchCountMode: TournamentMatchCountMode.PER_PLAYER,
    matchesPerPlayer: 3,
    gamesPerGroup: 8,
    selectedIds: new Set()
  });
  const [editing, setEditing] = useState<{ id: string; draft: DraftTournament } | null>(null);
  const [tournamentsCollapsed, setTournamentsCollapsed] = useState(false);

  const participantLookup: ParticipantLookup = useMemo(() => {
    const map = new Map<string, { displayName: string; username: string }>();
    players.forEach((player) => {
      map.set(player.id, { displayName: player.displayName, username: player.username });
    });
    tournaments.forEach((tournament) => {
      tournament.participants.forEach((participant) => {
        map.set(participant.userId, {
          displayName: participant.user.displayName,
          username: participant.user.username
        });
      });
    });
    return map;
  }, [players, tournaments]);

  const duplicateNameSet = useMemo(() => {
    const unique = new Map<string, { displayName: string }>();
    players.forEach((player) => unique.set(player.id, { displayName: player.displayName }));
    tournaments.forEach((tournament) => {
      tournament.participants.forEach((participant) =>
        unique.set(participant.userId, { displayName: participant.user.displayName })
      );
    });
    const combined = findDuplicateDisplayNames(Array.from(unique.values()));
    duplicateNames.forEach((name) => combined.add(name.toLowerCase()));
    return combined;
  }, [players, tournaments, duplicateNames]);


  const toggleSelection = (id: string) => {
    setForm((previous) => {
      const nextSet = new Set(previous.selectedIds);
      if (nextSet.has(id)) {
        nextSet.delete(id);
      } else {
        nextSet.add(id);
      }
      return { ...previous, selectedIds: nextSet };
    });
  };

  const handleCreate = () => {
    if (form.selectedIds.size < 2) {
      setError('Select at least two participants.');
      return;
    }
    if (form.groupCount < 1) {
      setError('Provide at least one group.');
      return;
    }

    const groupLabels = alphabet.slice(0, Math.min(form.groupCount, alphabet.length));

    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const response = await fetch('/api/admin/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim() || `Tournament ${leagueDayjs().format('YYYY-MM-DD')}`,
            mode: form.mode,
            matchCountMode: form.matchCountMode,
            matchesPerPlayer:
              form.matchCountMode === TournamentMatchCountMode.PER_PLAYER ? form.matchesPerPlayer : undefined,
            gamesPerGroup:
              form.matchCountMode === TournamentMatchCountMode.TOTAL_MATCHES ? form.gamesPerGroup : undefined,
            groupLabels,
            participantIds: Array.from(form.selectedIds),
            startAt: toLeagueIso(form.startAt),
            endAt: toLeagueIso(form.endAt)
          })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ? JSON.stringify(body.error) : 'Failed to create tournament.');
          return;
        }
        setMessage('Tournament created.');
        setForm((previous) => ({
          ...previous,
          name: '',
          selectedIds: new Set(),
          groupCount: Math.min(previous.groupCount, alphabet.length)
        }));
        router.refresh();
      } catch (err) {
        setError('Failed to create tournament.');
      }
    });
  };

  const beginEdit = (tournament: AdminTournament) => {
    const draft: DraftTournament = {
      id: tournament.id,
      status: tournament.status,
      matchCountMode: tournament.matchCountMode,
      matchesPerPlayer: tournament.matchesPerPlayer,
      gamesPerGroup: tournament.gamesPerGroup,
      groups: tournament.groups.map((group) => ({
        id: group.id,
        name: group.name,
        tableLabel: group.tableLabel,
        participantIds: group.participants.map((participant) => participant.userId),
        matches: group.matchups.map((match) => ({
          id: match.id,
          team1Ids: [...match.team1Ids],
          team2Ids: [...match.team2Ids],
          scheduledAt: match.scheduledAt ? leagueDayjs(match.scheduledAt).tz().format('YYYY-MM-DDTHH:mm') : null,
          status: match.status
        }))
      }))
    };
    setEditing({ id: tournament.id, draft });
    setMessage(null);
    setError(null);
  };

  const updateDraft = (nextDraft: DraftTournament) => {
    setEditing((current) => (current ? { id: current.id, draft: nextDraft } : current));
  };

  const cancelEdit = () => setEditing(null);

  const saveDraft = (draft: DraftTournament) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const response = await fetch(`/api/admin/tournaments/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: draft.status,
            groups: draft.groups.map((group) => ({
              id: group.id,
              name: group.name.trim() || group.id,
              tableLabel: group.tableLabel.trim() || group.name,
              participantIds: group.participantIds
            })),
            matches: draft.groups.flatMap((group) =>
              group.matches.map((match) => ({
                id: match.id,
                groupId: group.id,
                team1Ids: match.team1Ids.filter(Boolean),
                team2Ids: match.team2Ids.filter(Boolean),
                scheduledAt: match.scheduledAt ? toLeagueIso(match.scheduledAt) : null,
                status: match.status
              }))
            )
          })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ? JSON.stringify(body.error) : 'Unable to update tournament.');
          return;
        }
        setMessage('Tournament updated.');
        setEditing(null);
        router.refresh();
      } catch (err) {
        setError('Unable to update tournament.');
      }
    });
  };

  const updateStatus = (tournamentId: string, status: TournamentStatus) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const response = await fetch(`/api/admin/tournaments/${tournamentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error ? JSON.stringify(body.error) : 'Unable to update status.');
          return;
        }
        setMessage('Tournament status updated.');
        router.refresh();
      } catch (err) {
        setError('Unable to update status.');
      }
    });
  };

  const selectedCount = form.selectedIds.size;

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tournaments</h2>
        <span className="text-xs text-slate-500">All times KST</span>
      </div>
      {message ? <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <section className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h3 className="text-base font-semibold">Create Tournament</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
              placeholder="Autofill if blank"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Mode</span>
            <select
              value={form.mode}
              onChange={(event) => setForm((previous) => ({ ...previous, mode: event.target.value as TournamentMode }))}
              className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            >
              <option value={TournamentMode.SINGLES}>Singles</option>
              <option value={TournamentMode.DOUBLES}>Doubles</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Start (KST)</span>
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(event) => setForm((previous) => ({ ...previous, startAt: event.target.value }))}
              className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>End (KST)</span>
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(event) => setForm((previous) => ({ ...previous, endAt: event.target.value }))}
              className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Groups</span>
            <input
              type="number"
              min={1}
              max={alphabet.length}
              value={form.groupCount}
              onChange={(event) => setForm((previous) => ({ ...previous, groupCount: Number(event.target.value) }))}
              className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Match quota mode</span>
            <select
              value={form.matchCountMode}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  matchCountMode: event.target.value as TournamentMatchCountMode
                }))
              }
              className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            >
              <option value={TournamentMatchCountMode.PER_PLAYER}>Matches per player</option>
              <option value={TournamentMatchCountMode.TOTAL_MATCHES}>Total games per group</option>
            </select>
          </label>
          {form.matchCountMode === TournamentMatchCountMode.PER_PLAYER ? (
            <label className="flex flex-col gap-1 text-sm">
              <span>Matches / player</span>
              <input
                type="number"
                min={1}
                max={20}
                value={form.matchesPerPlayer}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, matchesPerPlayer: Number(event.target.value) }))
                }
                className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span>Total games / group</span>
              <input
                type="number"
                min={1}
                max={60}
                value={form.gamesPerGroup}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, gamesPerGroup: Number(event.target.value) }))
                }
                className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
              />
            </label>
          )}
          <div className="flex flex-col gap-1 text-sm">
            <span>Participants selected</span>
            <span className="rounded border border-dashed border-slate-300 px-3 py-2 dark:border-slate-600">{selectedCount}</span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
          <table className="w-full table-auto text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">Select</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Singles</th>
                <th className="px-3 py-2">Doubles</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={form.selectedIds.has(player.id)} onChange={() => toggleSelection(player.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{player.displayName}</span>
                    <span className="ml-2 text-xs text-slate-500">@{player.username}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{Math.round(player.singlesRating)}</td>
                  <td className="px-3 py-2 text-slate-500">{Math.round(player.doublesRating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-50"
          disabled={isPending}
        >
          {isPending ? 'Creating…' : 'Create Tournament'}
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Existing Tournaments</h3>
          {tournaments.length > 0 ? (
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              onClick={() => setTournamentsCollapsed((previous) => !previous)}
            >
              {tournamentsCollapsed ? 'Show tournaments' : 'Hide tournaments'}
            </button>
          ) : null}
        </div>
        {tournaments.length === 0 ? (
          <p className="text-sm text-slate-500">No tournaments yet.</p>
        ) : tournamentsCollapsed ? (
          <p className="text-sm text-slate-500">Tournament list hidden. Click “Show tournaments” to expand.</p>
        ) : (
          tournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              participantLookup={participantLookup}
              duplicateNames={duplicateNameSet}
              isEditing={editing?.id === tournament.id}
              draft={editing?.id === tournament.id ? editing.draft : null}
              onEdit={() => beginEdit(tournament)}
              onCancel={cancelEdit}
              onDraftChange={updateDraft}
              onSave={saveDraft}
              onStatusChange={(status) => updateStatus(tournament.id, status)}
              isPending={isPending}
            />
          ))
        )}
      </section>
    </div>
  );
}

interface TournamentCardProps {
  tournament: AdminTournament;
  participantLookup: ParticipantLookup;
  duplicateNames: Set<string>;
  isEditing: boolean;
  draft: DraftTournament | null;
  onEdit: () => void;
  onCancel: () => void;
  onDraftChange: (draft: DraftTournament) => void;
  onSave: (draft: DraftTournament) => void;
  onStatusChange: (status: TournamentStatus) => void;
  isPending: boolean;
}

function TournamentCard({
  tournament,
  participantLookup,
  duplicateNames,
  isEditing,
  draft,
  onEdit,
  onCancel,
  onDraftChange,
  onSave,
  onStatusChange,
  isPending
}: TournamentCardProps) {
  const statusOptions: TournamentStatus[] = [
    TournamentStatus.SCHEDULED,
    TournamentStatus.ACTIVE,
    TournamentStatus.COMPLETED,
    TournamentStatus.CANCELLED
  ];
  const matchSummary =
    tournament.matchCountMode === TournamentMatchCountMode.PER_PLAYER
      ? `${tournament.matchesPerPlayer ?? '–'} matches / player`
      : `${tournament.gamesPerGroup ?? 0} games / group`;
  const [collapsed, setCollapsed] = useState<boolean>(tournament.status !== TournamentStatus.ACTIVE);

  useEffect(() => {
    if (isEditing) {
      setCollapsed(false);
    }
  }, [isEditing]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold">{tournament.name}</h4>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <StatusBadge status={tournament.status} />
            <span>{tournament.mode}</span>
            <span>{matchSummary}</span>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Start: {formatDate(tournament.startAt)}</div>
          <div>End: {formatDate(tournament.endAt)}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span>Status</span>
          <select
            value={isEditing ? draft?.status ?? tournament.status : tournament.status}
            onChange={(event) => {
              const next = event.target.value as TournamentStatus;
              if (isEditing && draft) {
                onDraftChange({ ...draft, status: next });
              } else {
                onStatusChange(next);
              }
            }}
            className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700"
            disabled={isPending}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <a
          href={`/tournaments/${tournament.id}`}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          View public page
        </a>
        {isEditing ? (
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            onClick={onEdit}
            disabled={isPending}
          >
            Edit structure
          </button>
        )}
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          onClick={() => setCollapsed((previous) => !previous)}
        >
          {collapsed ? 'Expand details' : 'Collapse details'}
        </button>
        {isEditing && draft ? (
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-50"
            onClick={() => onSave(draft)}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        ) : null}
      </div>

      {!collapsed && (
        isEditing && draft ? (
          <TournamentEditor
            draft={draft}
            tournament={tournament}
            participantLookup={participantLookup}
            duplicateNames={duplicateNames}
            onChange={onDraftChange}
          />
        ) : (
          <TournamentReadonly
            tournament={tournament}
            participantLookup={participantLookup}
            duplicateNames={duplicateNames}
          />
        )
      )}
    </div>
  );
}

interface TournamentReadonlyProps {
  tournament: AdminTournament;
  participantLookup: ParticipantLookup;
  duplicateNames: Set<string>;
}

function TournamentReadonly({ tournament, participantLookup, duplicateNames }: TournamentReadonlyProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {tournament.groups.map((group) => (
        <div key={group.id} className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-600">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>
              Group {group.name} · Table {group.tableLabel}
            </span>
            <span className="text-xs text-slate-500">{group.participants.length} players</span>
          </div>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {group.participants.map((participant) => (
              <li key={participant.userId}>
                {formatDisplayLabel(participant.user.displayName, participant.user.username, duplicateNames)}
              </li>
            ))}
          </ul>
          <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
            {group.matchups.length === 0 ? (
              <p>No scheduled games.</p>
            ) : (
              group.matchups.map((match) => {
                const score = match.resultMatch
                  ? `${match.resultMatch.team1Score} – ${match.resultMatch.team2Score}`
                  : null;
                return (
                  <div key={match.id} className="rounded border border-slate-200 px-2 py-2 dark:border-slate-600">
                    <div className="font-medium text-slate-600 dark:text-slate-200">
                      {teamLabel(match.team1Ids, participantLookup, duplicateNames)}{' '}
                      <span className="mx-1 text-slate-400">vs</span>{' '}
                      {teamLabel(match.team2Ids, participantLookup, duplicateNames)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                      <span>{match.status}</span>
                      {score ? <span className="text-slate-500">Final {score}</span> : null}
                      {match.resultMatch?.playedAt ? <span>{formatDate(match.resultMatch.playedAt)}</span> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TournamentEditorProps {
  draft: DraftTournament;
  tournament: AdminTournament;
  participantLookup: ParticipantLookup;
  duplicateNames: Set<string>;
  onChange: (draft: DraftTournament) => void;
}

function TournamentEditor({ draft, tournament, participantLookup, duplicateNames, onChange }: TournamentEditorProps) {
  const teamSize = tournament.mode === TournamentMode.DOUBLES ? 2 : 1;
  const allParticipants = tournament.participants;

  const updateGroup = (groupId: string, updater: (group: DraftGroup) => DraftGroup) => {
    onChange({
      ...draft,
      groups: draft.groups.map((group) => (group.id === groupId ? updater(group) : group))
    });
  };

  const updateMatch = (groupId: string, matchId: string, updater: (match: DraftMatch) => DraftMatch) => {
    updateGroup(groupId, (group) => ({
      ...group,
      matches: group.matches.map((match) => (match.id === matchId ? updater(match) : match))
    }));
  };

  const availableForGroup = (groupId: string) => {
    const assignedElsewhere = new Set<string>();
    draft.groups.forEach((group) => {
      if (group.id === groupId) return;
      group.participantIds.forEach((userId) => assignedElsewhere.add(userId));
    });
    return allParticipants.filter((participant) => !assignedElsewhere.has(participant.userId));
  };

  const removeFromMatches = (matches: DraftMatch[], userId: string) =>
    matches.map((match) => ({
      ...match,
      team1Ids: match.team1Ids.map((id) => (id === userId ? '' : id)),
      team2Ids: match.team2Ids.map((id) => (id === userId ? '' : id))
    }));

  return (
    <div className="space-y-4">
      {draft.groups.map((group) => {
        const available = availableForGroup(group.id);
        return (
          <div key={group.id} className="space-y-3 rounded border border-dashed border-slate-300 p-3 dark:border-slate-600">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                <span>Group name</span>
                <input
                  type="text"
                  value={group.name}
                  onChange={(event) => updateGroup(group.id, (current) => ({ ...current, name: event.target.value }))}
                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>Table label</span>
                <input
                  type="text"
                  value={group.tableLabel}
                  onChange={(event) => updateGroup(group.id, (current) => ({ ...current, tableLabel: event.target.value }))}
                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>Add participant</span>
                <select
                  value=""
                  onChange={(event) => {
                    const userId = event.target.value;
                    if (!userId) return;
                    updateGroup(group.id, (current) => ({
                      ...current,
                      participantIds: current.participantIds.includes(userId)
                        ? current.participantIds
                        : [...current.participantIds, userId],
                      matches: current.matches
                    }));
                  }}
                  className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
                >
                  <option value="">Select participant</option>
                  {available.map((participant) => (
                    <option key={participant.userId} value={participant.userId}>
                      {formatDisplayLabel(
                        participant.user.displayName,
                        participant.user.username,
                        duplicateNames
                      )}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {group.participantIds.length === 0 ? (
                <p>No participants assigned.</p>
              ) : (
                group.participantIds.map((userId) => (
                  <div key={userId} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 dark:border-slate-600">
                    <span>
                      {formatDisplayLabel(
                        participantLookup.get(userId)?.displayName ?? userId,
                        participantLookup.get(userId)?.username ?? userId,
                        duplicateNames
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          participantIds: current.participantIds.filter((id) => id !== userId),
                          matches: removeFromMatches(current.matches, userId)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-600">
              <h5 className="font-semibold text-slate-600 dark:text-slate-200">Matchups</h5>
              {group.matches.length === 0 ? (
                <p className="text-slate-500">No matches generated for this group.</p>
              ) : (
                group.matches.map((match) => (
                  <div key={match.id} className="space-y-2 rounded border border-dashed border-slate-300 p-2 dark:border-slate-600">
                    <div className="grid gap-2 md:grid-cols-2">
                      <TeamEditor
                        label="Team 1"
                        team={match.team1Ids}
                        teamSize={teamSize}
                        groupParticipants={group.participantIds}
                        participantLookup={participantLookup}
                        duplicateNames={duplicateNames}
                        onChange={(team) => updateMatch(group.id, match.id, (current) => ({ ...current, team1Ids: team }))}
                      />
                      <TeamEditor
                        label="Team 2"
                        team={match.team2Ids}
                        teamSize={teamSize}
                        groupParticipants={group.participantIds}
                        participantLookup={participantLookup}
                        duplicateNames={duplicateNames}
                        onChange={(team) => updateMatch(group.id, match.id, (current) => ({ ...current, team2Ids: team }))}
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span>Scheduled (KST)</span>
                        <input
                          type="datetime-local"
                          value={match.scheduledAt ?? ''}
                          onChange={(event) =>
                            updateMatch(group.id, match.id, (current) => ({
                              ...current,
                              scheduledAt: event.target.value || null
                            }))
                          }
                          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span>Status</span>
                        <select
                          value={match.status}
                          onChange={(event) =>
                            updateMatch(group.id, match.id, (current) => ({
                              ...current,
                              status: event.target.value as TournamentMatchStatus
                            }))
                          }
                          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
                        >
                          <option value={TournamentMatchStatus.SCHEDULED}>Scheduled</option>
                          <option value={TournamentMatchStatus.PLAYED}>Played</option>
                          <option value={TournamentMatchStatus.CANCELLED}>Cancelled</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TeamEditorProps {
  label: string;
  team: string[];
  teamSize: number;
  groupParticipants: string[];
  participantLookup: ParticipantLookup;
  duplicateNames: Set<string>;
  onChange: (next: string[]) => void;
}

function TeamEditor({ label, team, teamSize, groupParticipants, participantLookup, duplicateNames, onChange }: TeamEditorProps) {
  const nextTeam = useMemo(() => {
    const copy = [...team];
    while (copy.length < teamSize) {
      copy.push('');
    }
    return copy.slice(0, teamSize);
  }, [team, teamSize]);

  const handleChange = (index: number, userId: string) => {
    const copy = [...nextTeam];
    copy[index] = userId;
    onChange(copy);
  };

  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <span className="font-semibold text-slate-500 dark:text-slate-300">{label}</span>
      {nextTeam.map((value, index) => (
        <select
          key={index}
          value={value}
          onChange={(event) => handleChange(index, event.target.value)}
          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
        >
          <option value="">Select player</option>
          {groupParticipants.map((userId) => (
            <option key={userId} value={userId}>
              {formatDisplayLabel(
                participantLookup.get(userId)?.displayName ?? userId,
                participantLookup.get(userId)?.username ?? userId,
                duplicateNames
              )}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: TournamentStatus }) {
  const className = clsx('rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide', {
    'bg-blue-100 text-blue-700': status === TournamentStatus.SCHEDULED,
    'bg-emerald-100 text-emerald-700': status === TournamentStatus.ACTIVE,
    'bg-slate-200 text-slate-700': status === TournamentStatus.COMPLETED,
    'bg-rose-100 text-rose-600': status === TournamentStatus.CANCELLED
  });
  return <span className={className}>{status.toLowerCase()}</span>;
}

function teamLabel(ids: string[], lookup: ParticipantLookup, duplicates: Set<string>) {
  if (!ids || ids.length === 0) return 'TBD';
  return ids
    .map((id) => {
      const participant = lookup.get(id);
      if (!participant) return id;
      return formatDisplayLabel(participant.displayName, participant.username, duplicates);
    })
    .join(' / ');
}
