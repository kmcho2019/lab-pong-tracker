import {
  MatchStatus,
  MatchType,
  ResultType,
  TournamentMatchStatus,
  TournamentMode,
  TournamentStatus,
  TournamentMatchCountMode
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { applyRatingsForMatch } from '@/server/rating-engine';

export interface TournamentDetailParticipantDTO {
  id: string;
  tournamentId: string;
  userId: string;
  seed: number | null;
  groupId: string | null;
  user: {
    id: string;
    username: string;
    displayName: string;
    singlesRating: number;
    doublesRating: number;
  };
}

export interface TournamentDetailMatchDTO {
  id: string;
  team1Ids: string[];
  team2Ids: string[];
  status: TournamentMatchStatus;
  scheduledAt: string | null;
  resultMatch: {
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

export interface TournamentDetailGroupDTO {
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
  matchups: TournamentDetailMatchDTO[];
}

export interface TournamentDetailDTO {
  id: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  matchCountMode: TournamentMatchCountMode;
  matchesPerPlayer: number | null;
  gamesPerGroup: number | null;
  startAt: string;
  endAt: string;
  participants: TournamentDetailParticipantDTO[];
  groups: TournamentDetailGroupDTO[];
}

const DEFAULT_TARGET_POINTS = 11;
const DEFAULT_WIN_BY_MARGIN = 2;

function assertScoreValid(team1Score: number, team2Score: number, target = DEFAULT_TARGET_POINTS, winBy = DEFAULT_WIN_BY_MARGIN) {
  if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score) || team1Score < 0 || team2Score < 0) {
    throw new Error('Scores must be non-negative integers.');
  }
  if (team1Score === team2Score) {
    throw new Error('Matches cannot end in a draw.');
  }
  const winner = Math.max(team1Score, team2Score);
  const loser = Math.min(team1Score, team2Score);
  if (winner < target) {
    throw new Error(`Winner must reach at least ${target} points.`);
  }
  if (winner - loser < winBy) {
    throw new Error(`Winner must lead by at least ${winBy} points.`);
  }
}

interface CreateTournamentParams {
  name: string;
  mode: TournamentMode;
  matchCountMode?: TournamentMatchCountMode;
  matchesPerPlayer?: number;
  gamesPerGroup?: number;
  groupLabels: string[];
  startAt: Date;
  endAt: Date;
  createdById: string;
  participantIds: string[];
}

interface ManualUpdatePayload {
  status?: TournamentStatus;
  groups?: Array<{
    id: string;
    name: string;
    tableLabel: string;
    participantIds: string[];
  }>;
  matches?: Array<{
    id: string;
    groupId: string;
    team1Ids: string[];
    team2Ids: string[];
    scheduledAt?: Date | null;
    status?: TournamentMatchStatus;
  }>;
}

export async function createTournament(params: CreateTournamentParams) {
  const {
    name,
    mode,
    matchCountMode = TournamentMatchCountMode.PER_PLAYER,
    matchesPerPlayer: matchesPerPlayerInput,
    gamesPerGroup: gamesPerGroupInput,
    groupLabels,
    startAt,
    endAt,
    createdById,
    participantIds
  } = params;

  const matchesPerPlayer = matchesPerPlayerInput ?? 3;
  const gamesPerGroup = gamesPerGroupInput ?? 8;

  if (participantIds.length < 2) {
    throw new Error('Tournament must include at least two participants.');
  }
  if (groupLabels.length === 0) {
    throw new Error('Provide at least one group label.');
  }
  if (new Set(groupLabels).size !== groupLabels.length) {
    throw new Error('Group labels must be unique.');
  }
  if (startAt >= endAt) {
    throw new Error('End time must be after the start time.');
  }
  if (mode === TournamentMode.DOUBLES && participantIds.length < 4) {
    throw new Error('Doubles tournaments require at least four participants.');
  }
  if (matchCountMode === TournamentMatchCountMode.PER_PLAYER && matchesPerPlayer < 1) {
    throw new Error('Matches per player must be at least 1.');
  }
  if (matchCountMode === TournamentMatchCountMode.TOTAL_MATCHES && gamesPerGroup < 1) {
    throw new Error('Games per group must be at least 1.');
  }

  const users = await prisma.user.findMany({
    where: { id: { in: participantIds } },
    select: {
      id: true,
      displayName: true,
      singlesRating: true,
      doublesRating: true
    }
  });

  if (users.length !== participantIds.length) {
    throw new Error('One or more participants could not be found.');
  }

  const ratingKey = mode === TournamentMode.SINGLES ? 'singlesRating' : 'doublesRating';
  const sorted = [...users]
    .map((user) => ({
      id: user.id,
      displayName: user.displayName,
      rating: user[ratingKey] ?? 1500
    }))
    .sort((a, b) => (b.rating ?? 1500) - (a.rating ?? 1500));
  const groups = distributeIntoGroups(sorted, groupLabels);

  const pairings = groups.map((group) => ({
    label: group.label,
    participants: group.participants.map((p) => p.id),
    matchups: (() => {
      const ids = group.participants.map((p) => p.id);
      if (mode === TournamentMode.SINGLES) {
        const combos = (ids.length * (ids.length - 1)) / 2;
        const limit = matchCountMode === TournamentMatchCountMode.PER_PLAYER
          ? Math.min(combos, Math.floor((matchesPerPlayer * ids.length) / 2))
          : Math.min(combos, gamesPerGroup);
        return generateSinglesPairings(ids, limit);
      }
      const target = matchCountMode === TournamentMatchCountMode.PER_PLAYER
        ? Math.max(0, Math.ceil((matchesPerPlayer * ids.length) / 4))
        : gamesPerGroup;
      return generateDoublesPairings(ids, target);
    })()
  }));

  const tournament = await prisma.$transaction(async (tx) => {
    const created = await tx.tournament.create({
      data: {
        name,
        mode,
        matchCountMode,
        matchesPerPlayer: matchCountMode === TournamentMatchCountMode.PER_PLAYER ? matchesPerPlayer : null,
        gamesPerGroup: matchCountMode === TournamentMatchCountMode.TOTAL_MATCHES ? gamesPerGroup : null,
        startAt,
        endAt,
        createdById
      }
    });

    const groupRecords = await Promise.all(
      pairings.map((group) =>
        tx.tournamentGroup.create({
          data: {
            tournamentId: created.id,
            name: group.label,
            tableLabel: group.label
          }
        })
      )
    );

    const groupMap = new Map<string, string>();
    groupRecords.forEach((record, index) => {
      groupMap.set(pairings[index].label, record.id);
    });

    await tx.tournamentParticipant.createMany({
      data: pairings.flatMap((group) =>
        group.participants.map((participantId, index) => ({
          tournamentId: created.id,
          userId: participantId,
          groupId: groupMap.get(group.label)!,
          seed: index + 1
        }))
      )
    });

    await tx.tournamentMatch.createMany({
      data: pairings.flatMap((group) => {
        const groupId = groupMap.get(group.label)!;
        return group.matchups.map((match) => ({
          tournamentId: created.id,
          groupId,
          team1Ids: match.team1,
          team2Ids: match.team2,
          scheduledAt: startAt,
          status: TournamentMatchStatus.SCHEDULED
        }));
      })
    });

    return created;
  });

  return tournament;
}

export async function updateTournamentStructure(tournamentId: string, payload: ManualUpdatePayload) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: true,
      groups: {
        include: {
          participants: true
        }
      }
    }
  });

  if (!tournament) {
    throw new Error('Tournament not found.');
  }

  const participantSet = new Set(tournament.participants.map((participant) => participant.userId));
  const groupIdSet = new Set(tournament.groups.map((group) => group.id));
  const assignmentAfterUpdate = new Map<string, Set<string>>();
  tournament.groups.forEach((group) => {
    assignmentAfterUpdate.set(group.id, new Set(group.participants.map((participant) => participant.userId)));
  });

  if (payload.groups) {
    const seen = new Set<string>();
    for (const group of payload.groups) {
      if (!groupIdSet.has(group.id)) {
        throw new Error('Cannot update unknown group.');
      }
      group.participantIds.forEach((userId) => {
        if (!participantSet.has(userId)) {
          throw new Error('Group assignments must reference registered participants.');
        }
        if (seen.has(userId)) {
          throw new Error('Participants cannot be assigned to multiple groups.');
        }
        seen.add(userId);
      });
    }

    payload.groups.forEach((group) => {
      assignmentAfterUpdate.set(group.id, new Set(group.participantIds));
    });
  }

  const requiredTeamSize = tournament.mode === TournamentMode.SINGLES ? 1 : 2;

  if (payload.matches) {
    for (const match of payload.matches) {
      if (!groupIdSet.has(match.groupId)) {
        throw new Error('Cannot update match for unknown group.');
      }
      const membership = assignmentAfterUpdate.get(match.groupId) ?? new Set<string>();
      const combined = [...match.team1Ids, ...match.team2Ids];
      if (combined.length !== new Set(combined).size) {
        throw new Error('Teams cannot share players.');
      }
      if (match.team1Ids.length !== requiredTeamSize || match.team2Ids.length !== requiredTeamSize) {
        throw new Error('Teams must match the tournament mode.');
      }
      for (const userId of combined) {
        if (!participantSet.has(userId)) {
          throw new Error('Matches must reference registered participants.');
        }
        if (!membership.has(userId)) {
          throw new Error('Match participants must belong to the specified group.');
        }
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    if (payload.status && payload.status !== tournament.status) {
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { status: payload.status }
      });
    }

    if (payload.groups) {
      for (const group of payload.groups) {
        await tx.tournamentGroup.update({
          where: { id: group.id },
          data: {
            name: group.name,
            tableLabel: group.tableLabel
          }
        });

        await tx.tournamentParticipant.updateMany({
          where: { groupId: group.id },
          data: { groupId: null, seed: null }
        });

        for (const [index, userId] of group.participantIds.entries()) {
          await tx.tournamentParticipant.update({
            where: {
              tournamentId_userId: {
                tournamentId,
                userId
              }
            },
            data: {
              groupId: group.id,
              seed: index + 1
            }
          });
        }
      }
    }

    if (payload.matches) {
      for (const match of payload.matches) {
        await tx.tournamentMatch.update({
          where: { id: match.id },
          data: {
            groupId: match.groupId,
            team1Ids: match.team1Ids,
            team2Ids: match.team2Ids,
            scheduledAt: match.scheduledAt ?? null,
            status: match.status ?? TournamentMatchStatus.SCHEDULED
          }
        });
      }
    }
  });
}


export async function listTournaments() {
  return prisma.tournament.findMany({
    orderBy: { startAt: 'desc' }
  });
}

export async function getTournamentDetail(id: string): Promise<TournamentDetailDTO | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              singlesRating: true,
              doublesRating: true
            }
          }
        }
      },
      groups: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  username: true,
                  singlesRating: true,
                  doublesRating: true
                }
              }
            }
          },
          matchups: {
            orderBy: { createdAt: 'asc' },
            include: {
              resultMatch: {
                select: {
                  id: true,
                  team1Score: true,
                  team2Score: true,
                  targetPoints: true,
                  winByMargin: true,
                  playedAt: true,
                  location: true,
                  note: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!tournament) {
    return null;
  }

  return {
    id: tournament.id,
    name: tournament.name,
    mode: tournament.mode,
    status: tournament.status,
    matchCountMode: tournament.matchCountMode,
    matchesPerPlayer: tournament.matchesPerPlayer,
    gamesPerGroup: tournament.gamesPerGroup,
    startAt: tournament.startAt.toISOString(),
    endAt: tournament.endAt.toISOString(),
    participants: tournament.participants.map((participant) => ({
      id: participant.id,
      tournamentId: participant.tournamentId,
      userId: participant.userId,
      seed: participant.seed ?? null,
      groupId: participant.groupId ?? null,
      user: {
        id: participant.user.id,
        username: participant.user.username,
        displayName: participant.user.displayName,
        singlesRating: participant.user.singlesRating ?? 1500,
        doublesRating: participant.user.doublesRating ?? 1500
      }
    })),
    groups: tournament.groups.map((group) => ({
      id: group.id,
      name: group.name,
      tableLabel: group.tableLabel,
      participants: group.participants.map((participant) => ({
        userId: participant.userId,
        user: {
          id: participant.user.id,
          username: participant.user.username,
          displayName: participant.user.displayName,
          rating:
            tournament.mode === TournamentMode.SINGLES
              ? participant.user.singlesRating ?? 1500
              : participant.user.doublesRating ?? 1500
        }
      })),
      matchups: group.matchups.map((matchup) => ({
        id: matchup.id,
        team1Ids: matchup.team1Ids,
        team2Ids: matchup.team2Ids,
        status: matchup.status,
        scheduledAt: matchup.scheduledAt ? matchup.scheduledAt.toISOString() : null,
        resultMatch: matchup.resultMatch
          ? {
              id: matchup.resultMatch.id,
              team1Score: matchup.resultMatch.team1Score,
              team2Score: matchup.resultMatch.team2Score,
              targetPoints: matchup.resultMatch.targetPoints,
              winByMargin: matchup.resultMatch.winByMargin,
              playedAt: matchup.resultMatch.playedAt ? matchup.resultMatch.playedAt.toISOString() : null,
              location: matchup.resultMatch.location,
              note: matchup.resultMatch.note
            }
          : null
      }))
    }))
  };
}

interface ReportMatchPayload {
  reporterId: string;
  tournamentId: string;
  tournamentMatchId: string;
  team1Score: number;
  team2Score: number;
  location?: string;
  note?: string;
  targetPoints?: number;
  winByMargin?: number;
}

export async function reportTournamentMatch({
  reporterId,
  tournamentId,
  tournamentMatchId,
  team1Score,
  team2Score,
  location,
  note,
  targetPoints,
  winByMargin
}: ReportMatchPayload) {
  const tournamentMatch = await prisma.tournamentMatch.findUnique({
    where: { id: tournamentMatchId },
    include: {
      tournament: true,
      group: {
        include: {
          participants: true
        }
      }
    }
  });

  if (!tournamentMatch || tournamentMatch.tournamentId !== tournamentId) {
    throw new Error('Tournament match not found.');
  }

  if (tournamentMatch.status === TournamentMatchStatus.PLAYED) {
    throw new Error('This matchup has already been reported.');
  }

  if (tournamentMatch.status === TournamentMatchStatus.CANCELLED) {
    throw new Error('This matchup has been cancelled.');
  }

  const tournament = tournamentMatch.tournament;
  const now = new Date();
  const requiredTeamSize = tournament.mode === TournamentMode.SINGLES ? 1 : 2;
  const team1Ids = tournamentMatch.team1Ids;
  const team2Ids = tournamentMatch.team2Ids;
  const configuredIds = [...team1Ids, ...team2Ids];
  const uniqueConfigured = new Set(configuredIds);

  if (team1Ids.length !== requiredTeamSize || team2Ids.length !== requiredTeamSize) {
    throw new Error('Tournament configuration for this match is invalid.');
  }

  if (uniqueConfigured.size !== configuredIds.length) {
    throw new Error('Configured teams cannot share players.');
  }

  const groupMembers = new Set(tournamentMatch.group.participants.map((participant) => participant.userId));
  for (const userId of uniqueConfigured) {
    if (!groupMembers.has(userId)) {
      throw new Error('Configured teams must belong to the assigned group.');
    }
  }

  const isAdmin = await prisma.user
    .findUnique({
      where: { id: reporterId },
      select: { role: true }
    })
    .then((user) => user?.role === 'ADMIN');

  const isReporterParticipant = uniqueConfigured.has(reporterId);

  if (!isAdmin && !isReporterParticipant) {
    throw new Error('Only participants or admins may report this matchup.');
  }

  if (!isAdmin) {
    if (tournament.status !== TournamentStatus.ACTIVE) {
      throw new Error('The tournament is not currently accepting results.');
    }
    if (now < tournament.startAt || now > tournament.endAt) {
      throw new Error('The reporting window for this tournament has closed.');
    }
  }

  const resolvedTarget = targetPoints ?? DEFAULT_TARGET_POINTS;
  const resolvedWinBy = winByMargin ?? DEFAULT_WIN_BY_MARGIN;
  assertScoreValid(team1Score, team2Score, resolvedTarget, resolvedWinBy);

  const matchType = tournament.mode === TournamentMode.SINGLES ? MatchType.SINGLES : MatchType.DOUBLES;
  const enteredBy = reporterId;

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.match.create({
      data: {
        matchType,
        status: MatchStatus.CONFIRMED,
        resultType: ResultType.NORMAL,
        team1Score,
        team2Score,
        targetPoints: resolvedTarget,
        winByMargin: resolvedWinBy,
        playedAt: tournamentMatch.scheduledAt ?? now,
        location,
        note,
        enteredById: enteredBy,
        confirmedById: enteredBy,
        confirmedAt: now,
        tournamentMatchId,
        teams: {
          create: [{ teamNo: 1 }, { teamNo: 2 }]
        }
      },
      include: {
        teams: true
      }
    });

    const teamOne = created.teams.find((team) => team.teamNo === 1);
    const teamTwo = created.teams.find((team) => team.teamNo === 2);
    if (!teamOne || !teamTwo) {
      throw new Error('Failed to create match teams.');
    }

    await tx.matchParticipant.createMany({
      data: [
        ...team1Ids.map((userId) => ({ matchId: created.id, userId, teamId: teamOne.id })),
        ...team2Ids.map((userId) => ({ matchId: created.id, userId, teamId: teamTwo.id }))
      ]
    });

    await tx.tournamentMatch.update({
      where: { id: tournamentMatchId },
      data: {
        status: TournamentMatchStatus.PLAYED
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: enteredBy,
        matchId: created.id,
        message: 'TOURNAMENT_MATCH_REPORTED',
        metadata: {
          tournamentId,
          tournamentMatchId
        }
      }
    });

    return created;
  });

  await applyRatingsForMatch(match.id);

  if (tournament.status === TournamentStatus.SCHEDULED) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.ACTIVE }
    });
  }

  const remaining = await prisma.tournamentMatch.count({
    where: {
      tournamentId,
      status: { not: TournamentMatchStatus.PLAYED }
    }
  });

  if (remaining === 0 && tournament.status !== TournamentStatus.CANCELLED) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.COMPLETED }
    });
  }

  return match;
}



export function distributeIntoGroups(
  participants: Array<{ id: string; displayName: string; rating: number }>,
  labels: string[]
) {
  const groupCount = labels.length;
  const total = participants.length;
  const baseSize = Math.floor(total / groupCount);
  let remainder = total % groupCount;
  let cursor = 0;

  return labels.map((label, index) => {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    const slice = participants.slice(cursor, cursor + size);
    cursor += size;
    return {
      label,
      participants: slice
    };
  });
}

export function generateSinglesPairings(participantIds: string[], limit: number) {
  if (participantIds.length < 2 || limit <= 0) {
    return [] as Array<{ team1: string[]; team2: string[] }>;
  }

  const rounds = roundRobinRounds(participantIds);
  const counts = Object.fromEntries(participantIds.map((id) => [id, 0])) as Record<string, number>;
  const pairs: Array<{ team1: string[]; team2: string[] }> = [];
  const maxMatches = Math.min(limit, rounds.reduce((acc, round) => acc + round.length, 0));

  for (const round of rounds) {
    if (pairs.length >= maxMatches) break;
    if (round.length === 0) continue;

    const remainingCapacity = maxMatches - pairs.length;

    if (round.length <= remainingCapacity) {
      for (const [home, away] of round) {
        pairs.push({ team1: [home], team2: [away] });
        counts[home] = (counts[home] ?? 0) + 1;
        counts[away] = (counts[away] ?? 0) + 1;
      }
      continue;
    }

    const available = [...round];
    while (pairs.length < maxMatches && available.length > 0) {
      available.sort((a, b) => {
        const [aHome, aAway] = a;
        const [bHome, bAway] = b;
        const aMax = Math.max(counts[aHome] ?? 0, counts[aAway] ?? 0);
        const bMax = Math.max(counts[bHome] ?? 0, counts[bAway] ?? 0);
        if (aMax !== bMax) return aMax - bMax;
        const aSum = (counts[aHome] ?? 0) + (counts[aAway] ?? 0);
        const bSum = (counts[bHome] ?? 0) + (counts[bAway] ?? 0);
        if (aSum !== bSum) return aSum - bSum;
        return participantIds.indexOf(aHome) - participantIds.indexOf(bHome);
      });

      const selected = available.shift();
      if (!selected) break;
      const [home, away] = selected;
      pairs.push({ team1: [home], team2: [away] });
      counts[home] = (counts[home] ?? 0) + 1;
      counts[away] = (counts[away] ?? 0) + 1;
    }
  }

  return pairs;
}

function roundRobinRounds(players: string[]) {
  const list = [...players];
  if (list.length <= 1) {
    return [] as Array<Array<[string, string]>>;
  }
  if (list.length % 2 === 1) {
    list.push('BYE');
  }

  const half = list.length / 2;
  const rotation = list.slice(1);
  const totalRounds = list.length - 1;
  const rounds: Array<Array<[string, string]>> = [];

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const roundPairs: Array<[string, string]> = [];
    const left = [list[0], ...rotation.slice(0, half - 1)];
    const right = rotation.slice(half - 1).reverse();

    for (let i = 0; i < half; i += 1) {
      const home = left[i];
      const away = right[i];
      if (home !== 'BYE' && away !== 'BYE') {
        roundPairs.push([home, away]);
      }
    }

    rounds.push(roundPairs);
    rotation.push(rotation.shift()!);
  }

  return rounds;
}

export function generateDoublesPairings(participantIds: string[], limit: number) {
  const ids = participantIds.filter(Boolean);
  if (ids.length < 4 || limit <= 0) return [] as Array<{ team1: string[]; team2: string[] }>;
  const counts = Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>;
  const maxPerPlayer = Math.max(1, Math.ceil((limit * 4) / ids.length));
  const matchups: Array<{ team1: string[]; team2: string[] }> = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (matchups.length < limit && attempts < limit * 30) {
    attempts += 1;
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 3 < shuffled.length && matchups.length < limit; i += 4) {
      const team1 = [shuffled[i], shuffled[i + 1]];
      const team2 = [shuffled[i + 2], shuffled[i + 3]];
      if (team1.some((id) => counts[id] >= maxPerPlayer) || team2.some((id) => counts[id] >= maxPerPlayer)) {
        continue;
      }
      const canonical = [team1.slice().sort().join(':'), team2.slice().sort().join(':')].sort().join('|');
      if (seen.has(canonical)) {
        continue;
      }
      seen.add(canonical);
      counts[team1[0]] += 1;
      counts[team1[1]] += 1;
      counts[team2[0]] += 1;
      counts[team2[1]] += 1;
      matchups.push({ team1, team2 });
    }
  }

  return matchups.slice(0, limit);
}
