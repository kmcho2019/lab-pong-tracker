'use client';

import { useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { TournamentMatchStatus, TournamentMode, TournamentStatus } from '@prisma/client';
import { formatDate, formatDistanceToNow, leagueDayjs } from '@/utils/time';

interface TournamentDetailClientProps {
  tournament: TournamentDetail;
  userId: string | null;
  role: 'ADMIN' | 'USER';
}

interface TournamentDetail {
  id: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  gamesPerGroup: number;
  startAt: string;
  endAt: string;
  participants: TournamentDetailParticipant[];
  groups: TournamentDetailGroup[];
}

interface TournamentDetailParticipant {
  id: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}

interface TournamentDetailGroup {
  id: string;
  name: string;
  tableLabel: string;
  participants: Array<{
    userId: string;
    user: {
      id: string;
      username: string;
      displayName: string;
      rating: number;
    };
  }>;
  matchups: TournamentDetailMatch[];
}

interface TournamentDetailMatch {
  id: string;
  team1Ids: string[];
  team2Ids: string[];
  status: TournamentMatchStatus;
  scheduledAt: string | null;
  resultMatch?: {
    id: string;
    team1Score: number;
    team2Score: number;
    targetPoints: number;
    winByMargin: number;
    playedAt: string | null;
    location: string | null;
    note: string | null;
  } | null;
}

type ParticipantLookup = Map<string, { displayName: string; username: string }>;

type ReportState = {
  team1Score: string;
  team2Score: string;
  location: string;
  note: string;
};

type ActiveReport = {
  groupId: string;
  matchId: string;
};

const defaultReportState: ReportState = {
  team1Score: '',
  team2Score: '',
  location: '',
  note: ''
};

export function TournamentDetailClient({ tournament, userId, role }: TournamentDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeReport, setActiveReport] = useState<ActiveReport | null>(null);
  const [reportState, setReportState] = useState<ReportState>(defaultReportState);
  const [reportError, setReportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const participantLookup: ParticipantLookup = useMemo(() => {
    const map = new Map<string, { displayName: string; username: string }>();
    tournament.participants.forEach((participant) => {
      map.set(participant.userId, {
        displayName: participant.user.displayName,
        username: participant.user.username
      });
    });
    return map;
  }, [tournament.participants]);

  const now = leagueDayjs();
  const start = leagueDayjs(tournament.startAt);
  const end = leagueDayjs(tournament.endAt);
  const isWithinWindow = now.isAfter(start) && now.isBefore(end);

  const handleOpenReport = (groupId: string, matchId: string) => {
    setActiveReport({ groupId, matchId });
    setReportState(defaultReportState);
    setReportError(null);
    setFeedback(null);
  };

  const handleCancelReport = () => {
    setActiveReport(null);
    setReportState(defaultReportState);
    setReportError(null);
  };

  const handleSubmitReport = (match: TournamentDetailMatch) => {
    const team1Score = Number(reportState.team1Score);
    const team2Score = Number(reportState.team2Score);
    if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score)) {
      setReportError('Scores must be integers.');
      return;
    }
    if (team1Score < 0 || team2Score < 0) {
      setReportError('Scores cannot be negative.');
      return;
    }
    if (team1Score === team2Score) {
      setReportError('Matches cannot end in a draw.');
      return;
    }

    startTransition(async () => {
      setReportError(null);
      setFeedback(null);
      try {
        const response = await fetch(`/api/tournaments/${tournament.id}/matches/${match.id}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team1Score,
            team2Score,
            location: reportState.location || undefined,
            note: reportState.note || undefined
          })
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setReportError(body.error || 'Failed to report result.');
          return;
        }
        setFeedback('Result submitted. Rankings will refresh shortly.');
        setActiveReport(null);
        setReportState(defaultReportState);
        router.refresh();
      } catch (err) {
        setReportError('Failed to report result.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{tournament.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <StatusBadge status={tournament.status} />
              <span>{tournament.mode}</span>
              <span>Games / group: {tournament.gamesPerGroup}</span>
            </div>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div>Starts: {formatDate(tournament.startAt)}</div>
            <div>Ends: {formatDate(tournament.endAt)}</div>
            <div className="text-xs text-slate-400">{start.isAfter(now) ? `Starts ${formatDistanceToNow(tournament.startAt)}` : `Ends ${formatDistanceToNow(tournament.endAt)}`}</div>
          </div>
        </div>
        {tournament.status === TournamentStatus.ACTIVE ? (
          <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
            Reporting window is open. Submit results as soon as you finish your games.
          </p>
        ) : null}
        {feedback ? <p className="mt-4 rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{feedback}</p> : null}
        {reportError && !activeReport ? (
          <p className="mt-4 rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{reportError}</p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {tournament.groups.map((group) => {
          const containsCurrentUser = userId ? group.participants.some((participant) => participant.userId === userId) : false;
          return (
            <section key={group.id} className={clsx('space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800', containsCurrentUser && 'ring-2 ring-blue-400')}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Group {group.name}</h2>
                <span className="text-xs text-slate-500">Table {group.tableLabel}</span>
              </div>
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {group.participants.map((participant) => (
                  <li
                    key={participant.userId}
                    className={clsx('flex items-center justify-between rounded px-2 py-1', participant.userId === userId && 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200')}
                  >
                    <span>{participant.user.displayName}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{Math.round(participant.user.rating)}</span>
                      <span>@{participant.user.username}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {group.matchups.length === 0 ? (
                  <p className="text-slate-500">No matchups scheduled yet.</p>
                ) : (
                  group.matchups.map((match) => {
                    const teams = teamSummary(match, participantLookup);
                    const hasResult = match.status === TournamentMatchStatus.PLAYED && match.resultMatch;
                    const canReport =
                      tournament.status === TournamentStatus.ACTIVE &&
                      match.status === TournamentMatchStatus.SCHEDULED &&
                      (role === 'ADMIN' || (userId ? match.team1Ids.includes(userId) || match.team2Ids.includes(userId) : false));

                    return (
                      <div key={match.id} className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-700 dark:text-slate-100">{teams}</div>
                            <div className="text-xs text-slate-400">
                              {match.scheduledAt ? `Scheduled ${formatDate(match.scheduledAt)}` : 'Time TBD'} · {match.status}
                            </div>
                          </div>
                          {hasResult ? (
                            <div className="rounded bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              {match.resultMatch?.team1Score} – {match.resultMatch?.team2Score}
                            </div>
                          ) : null}
                        </div>
                        {match.resultMatch?.note ? (
                          <p className="text-xs text-slate-500">“{match.resultMatch.note}”</p>
                        ) : null}
                        {match.resultMatch?.location ? (
                          <p className="text-xs text-slate-500">Location: {match.resultMatch.location}</p>
                        ) : null}
                        {canReport ? (
                          <div className="space-y-2">
                            {activeReport && activeReport.matchId === match.id ? (
                              <ReportForm
                                state={reportState}
                                onChange={setReportState}
                                onSubmit={() => handleSubmitReport(match)}
                                onCancel={handleCancelReport}
                                isPending={isPending}
                                error={reportError}
                                teamLabels={{
                                  team1: teamLabel(match.team1Ids, participantLookup),
                                  team2: teamLabel(match.team2Ids, participantLookup)
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-300 dark:hover:bg-blue-900/40"
                                onClick={() => handleOpenReport(group.id, match.id)}
                                disabled={isPending}
                              >
                                Report result
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface ReportFormProps {
  state: ReportState;
  onChange: (next: ReportState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
  teamLabels: {
    team1: string;
    team2: string;
  };
}

function ReportForm({ state, onChange, onSubmit, onCancel, isPending, error, teamLabels }: ReportFormProps) {
  return (
    <div className="space-y-2 rounded border border-slate-300 p-3 text-xs dark:border-slate-600">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
        <span>{teamLabels.team1}</span>
        <span className="text-slate-400">vs</span>
        <span>{teamLabels.team2}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>Team 1 score</span>
          <input
            type="number"
            min={0}
            value={state.team1Score}
            onChange={(event) => onChange({ ...state, team1Score: event.target.value })}
            className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Team 2 score</span>
          <input
            type="number"
            min={0}
            value={state.team2Score}
            onChange={(event) => onChange({ ...state, team2Score: event.target.value })}
            className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span>Location (optional)</span>
        <input
          type="text"
          value={state.location}
          onChange={(event) => onChange({ ...state, location: event.target.value })}
          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
          placeholder="Example: Postech Change Up Ground"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Note (optional)</span>
        <textarea
          value={state.note}
          onChange={(event) => onChange({ ...state, note: event.target.value })}
          className="min-h-[60px] rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-700"
          maxLength={280}
        />
      </label>
      {error ? <p className="rounded bg-rose-100 px-2 py-1 text-rose-700">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          onClick={onSubmit}
          disabled={isPending}
        >
          {isPending ? 'Submitting…' : 'Submit result'}
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
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

function teamLabel(ids: string[], lookup: ParticipantLookup) {
  if (!ids || ids.length === 0) return 'TBD';
  return ids.map((id) => lookup.get(id)?.displayName ?? id).join(' / ');
}

function teamSummary(match: TournamentDetailMatch, lookup: ParticipantLookup) {
  return `${teamLabel(match.team1Ids, lookup)} vs ${teamLabel(match.team2Ids, lookup)}`;
}
