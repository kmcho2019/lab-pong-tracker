import {
  MatchStatus,
  MatchType,
  ResultType,
  TournamentFormat,
  TournamentMatchCountMode,
  TournamentMatchStatus,
  TournamentMode,
  TournamentStatus
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
  iteration: number;
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
  placements: TournamentPlacementDTO[];
}

export interface TournamentPlacementDTO {
  teamIds: string[];
  wins: number;
  losses: number;
  matchesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  rank: number;
}

export interface TournamentDetailDTO {
  id: string;
  name: string;
  mode: TournamentMode;
  format: TournamentFormat;
  status: TournamentStatus;
  matchCountMode: TournamentMatchCountMode;
  matchesPerPlayer: number | null;
  gamesPerGroup: number | null;
  roundRobinIterations: number;
  startAt: string;
  endAt: string;
  participants: TournamentDetailParticipantDTO[];
  groups: TournamentDetailGroupDTO[];
}

const DEFAULT_TARGET_POINTS = 11;
const DEFAULT_WIN_BY_MARGIN = 2;

export type ScheduledMatchDefinition = {
  team1: string[];
  team2: string[];
  iteration: number;
};

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
  format?: TournamentFormat;
  matchCountMode?: TournamentMatchCountMode;
  matchesPerPlayer?: number;
  gamesPerGroup?: number;
  groupLabels: string[];
  startAt: Date;
  endAt: Date;
  createdById: string;
  participantIds: string[];
  roundRobinIterations?: number;
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
    format = TournamentFormat.STANDARD,
    matchCountMode = TournamentMatchCountMode.PER_PLAYER,
    matchesPerPlayer: matchesPerPlayerInput,
    gamesPerGroup: gamesPerGroupInput,
    groupLabels,
    startAt,
    endAt,
    createdById,
    participantIds,
    roundRobinIterations: roundRobinIterationsInput
  } = params;

  const matchesPerPlayer = matchesPerPlayerInput ?? 3;
  const gamesPerGroup = gamesPerGroupInput ?? 8;
  const roundRobinIterations = Math.max(1, roundRobinIterationsInput ?? 1);

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
  const isCompetitiveMonthly = format === TournamentFormat.COMPETITIVE_MONTHLY;
  if (isCompetitiveMonthly && matchCountMode !== TournamentMatchCountMode.PER_PLAYER) {
    throw new Error('Competitive monthly tournaments always allocate matches per player.');
  }
  if (isCompetitiveMonthly && roundRobinIterations > 5) {
    throw new Error('Round robin iterations are limited to five per tournament.');
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
  const preparedParticipants = users.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    rating: user[ratingKey] ?? 1500
  }));

  const sortedParticipants = [...preparedParticipants].sort((a, b) => (b.rating ?? 1500) - (a.rating ?? 1500));
  const groups = distributeIntoGroups(sortedParticipants, groupLabels);

  const pairings = groups.map((group) => {
    const participantIds = group.participants.map((participant) => participant.id);

    if (isCompetitiveMonthly) {
      if (mode === TournamentMode.SINGLES) {
        if (participantIds.length < 2) {
          throw new Error('Competitive singles groups require at least two participants.');
        }
        const schedule = generateCompetitiveSinglesSchedule(participantIds, roundRobinIterations);
        return {
          label: group.label,
          participants: participantIds,
          matchups: schedule
        };
      }

      if (participantIds.length < 4 || participantIds.length % 2 !== 0) {
        throw new Error('Competitive doubles groups require an even number of participants (minimum four).');
      }

      const schedule = generateCompetitiveDoublesSchedule(group.participants, roundRobinIterations);
      return {
        label: group.label,
        participants: participantIds,
        matchups: schedule
      };
    }

    if (mode === TournamentMode.SINGLES) {
      const combos = (participantIds.length * (participantIds.length - 1)) / 2;
      const limit = matchCountMode === TournamentMatchCountMode.PER_PLAYER
        ? Math.min(combos, Math.floor((matchesPerPlayer * participantIds.length) / 2))
        : Math.min(combos, gamesPerGroup);
      const schedule = generateSinglesPairings(participantIds, limit);
      return {
        label: group.label,
        participants: participantIds,
        matchups: schedule
      };
    }

    const target = matchCountMode === TournamentMatchCountMode.PER_PLAYER
      ? Math.max(0, Math.ceil((matchesPerPlayer * participantIds.length) / 4))
      : gamesPerGroup;
    const schedule = generateDoublesPairings(participantIds, target);
    return {
      label: group.label,
      participants: participantIds,
      matchups: schedule
    };
  });

  const storedMatchesPerPlayer = !isCompetitiveMonthly && matchCountMode === TournamentMatchCountMode.PER_PLAYER
    ? matchesPerPlayer
    : null;
  const storedGamesPerGroup = !isCompetitiveMonthly && matchCountMode === TournamentMatchCountMode.TOTAL_MATCHES
    ? gamesPerGroup
    : null;

  const tournament = await prisma.$transaction(async (tx) => {
    const created = await tx.tournament.create({
      data: {
        name,
        mode,
        format,
        matchCountMode,
        matchesPerPlayer: storedMatchesPerPlayer,
        gamesPerGroup: storedGamesPerGroup,
        roundRobinIterations,
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
          iteration: match.iteration ?? 1,
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

  const placementsByGroup = new Map<string, TournamentPlacementDTO[]>();

  tournament.groups.forEach((group) => {
    const placements = calculatePlacementsForGroup(
      tournament.mode,
      group.participants.map((participant) => ({ userId: participant.userId })),
      group.matchups.map((matchup) => ({
        team1Ids: matchup.team1Ids,
        team2Ids: matchup.team2Ids,
        status: matchup.status,
        resultMatch: matchup.resultMatch
          ? {
              team1Score: matchup.resultMatch.team1Score,
              team2Score: matchup.resultMatch.team2Score
            }
          : null
      }))
    );
    placementsByGroup.set(group.id, placements);
  });

  return {
    id: tournament.id,
    name: tournament.name,
    mode: tournament.mode,
    format: tournament.format,
    status: tournament.status,
    matchCountMode: tournament.matchCountMode,
    matchesPerPlayer: tournament.matchesPerPlayer,
    gamesPerGroup: tournament.gamesPerGroup,
    roundRobinIterations: tournament.roundRobinIterations,
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
        iteration: matchup.iteration ?? 1,
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
      })),
      placements: placementsByGroup.get(group.id) ?? []
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

export function generateCompetitiveSinglesSchedule(participantIds: string[], iterations: number) {
  const ids = participantIds.filter(Boolean);
  if (ids.length < 2 || iterations < 1) {
    return [] as ScheduledMatchDefinition[];
  }

  const rounds = roundRobinRounds(ids);
  const matches: ScheduledMatchDefinition[] = [];

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const swapOrder = iteration % 2 === 0;
    for (const round of rounds) {
      for (const [home, away] of round) {
        const team1 = swapOrder ? [away] : [home];
        const team2 = swapOrder ? [home] : [away];
        matches.push({ team1, team2, iteration });
      }
    }
  }

  return matches;
}

export function generateCompetitiveDoublesSchedule(
  participants: Array<{ id: string; rating: number }>,
  iterations: number
) {
  const list = participants.filter((participant) => Boolean(participant.id));
  if (list.length < 4 || iterations < 1) {
    return [] as ScheduledMatchDefinition[];
  }
  if (list.length % 2 !== 0) {
    throw new Error('Competitive doubles scheduling requires an even number of participants.');
  }

  const sorted = [...list].sort((a, b) => (b.rating ?? 1500) - (a.rating ?? 1500));
  const teamCount = sorted.length / 2;
  const teams: string[][] = [];

  for (let index = 0; index < teamCount; index += 1) {
    const high = sorted[index];
    const low = sorted[sorted.length - 1 - index];
    teams.push([high.id, low.id]);
  }

  const labels = teams.map((_, index) => `T${index}`);
  const labelIndex = new Map(labels.map((label, index) => [label, index]));
  const rounds = roundRobinRounds(labels);
  const matches: ScheduledMatchDefinition[] = [];

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const swapOrder = iteration % 2 === 0;
    for (const round of rounds) {
      for (const [homeLabel, awayLabel] of round) {
        if (homeLabel === 'BYE' || awayLabel === 'BYE') continue;
        const homeIndex = labelIndex.get(homeLabel);
        const awayIndex = labelIndex.get(awayLabel);
        if (homeIndex === undefined || awayIndex === undefined) continue;
        const homeTeam = teams[homeIndex];
        const awayTeam = teams[awayIndex];
        const team1 = swapOrder ? [...awayTeam] : [...homeTeam];
        const team2 = swapOrder ? [...homeTeam] : [...awayTeam];
        matches.push({ team1, team2, iteration });
      }
    }
  }

  return matches;
}

function canonicalTeamKey(ids: string[]) {
  return [...ids].sort().join('|');
}

interface PlacementAccumulator {
  teamIds: string[];
  wins: number;
  losses: number;
  matchesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
}

export function calculatePlacementsForGroup(
  mode: TournamentMode,
  participants: Array<{ userId: string }>,
  matchups: Array<{
    team1Ids: string[];
    team2Ids: string[];
    status: TournamentMatchStatus;
    resultMatch: { team1Score: number; team2Score: number } | null;
  }>
): TournamentPlacementDTO[] {
  const stats = new Map<string, PlacementAccumulator>();

  const ensure = (ids: string[]) => {
    const key = canonicalTeamKey(ids);
    if (!stats.has(key)) {
      stats.set(key, {
        teamIds: [...ids].sort(),
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0
      });
    }
    return stats.get(key)!;
  };

  if (mode === TournamentMode.SINGLES) {
    participants.forEach((participant) => ensure([participant.userId]));
  }

  matchups.forEach((match) => {
    ensure(match.team1Ids);
    ensure(match.team2Ids);
    if (match.status !== TournamentMatchStatus.PLAYED || !match.resultMatch) {
      return;
    }
    const team1 = ensure(match.team1Ids);
    const team2 = ensure(match.team2Ids);
    const { team1Score, team2Score } = match.resultMatch;

    team1.matchesPlayed += 1;
    team2.matchesPlayed += 1;
    team1.pointsFor += team1Score;
    team1.pointsAgainst += team2Score;
    team2.pointsFor += team2Score;
    team2.pointsAgainst += team1Score;

    if (team1Score > team2Score) {
      team1.wins += 1;
      team2.losses += 1;
    } else if (team2Score > team1Score) {
      team2.wins += 1;
      team1.losses += 1;
    }
  });

  const placements = Array.from(stats.values()).map((entry) => ({
    teamIds: entry.teamIds,
    wins: entry.wins,
    losses: entry.losses,
    matchesPlayed: entry.matchesPlayed,
    pointsFor: entry.pointsFor,
    pointsAgainst: entry.pointsAgainst,
    pointDifferential: entry.pointsFor - entry.pointsAgainst,
    rank: 0
  }));

  placements.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diff = b.pointDifferential - a.pointDifferential;
    if (diff !== 0) return diff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.teamIds.join('|').localeCompare(b.teamIds.join('|'));
  });

  let currentRank = 0;
  let previousSignature: { wins: number; diff: number; points: number } | null = null;

  placements.forEach((placement, index) => {
    const signature = {
      wins: placement.wins,
      diff: placement.pointDifferential,
      points: placement.pointsFor
    };
    if (
      previousSignature &&
      previousSignature.wins === signature.wins &&
      previousSignature.diff === signature.diff &&
      previousSignature.points === signature.points
    ) {
      placement.rank = currentRank;
    } else {
      currentRank = index + 1;
      placement.rank = currentRank;
      previousSignature = signature;
    }
  });

  return placements;
}

export function generateSinglesPairings(participantIds: string[], limit: number): ScheduledMatchDefinition[] {
  if (participantIds.length < 2 || limit <= 0) {
    return [] as ScheduledMatchDefinition[];
  }

  const rounds = roundRobinRounds(participantIds);
  const counts = Object.fromEntries(participantIds.map((id) => [id, 0])) as Record<string, number>;
  const pairs: ScheduledMatchDefinition[] = [];
  const maxMatches = Math.min(limit, rounds.reduce((acc, round) => acc + round.length, 0));

  for (const round of rounds) {
    if (pairs.length >= maxMatches) break;
    if (round.length === 0) continue;

    const remainingCapacity = maxMatches - pairs.length;

    if (round.length <= remainingCapacity) {
      for (const [home, away] of round) {
        pairs.push({ team1: [home], team2: [away], iteration: 1 });
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
      pairs.push({ team1: [home], team2: [away], iteration: 1 });
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

export function generateDoublesPairings(participantIds: string[], limit: number): ScheduledMatchDefinition[] {
  const ids = participantIds.filter(Boolean);
  if (ids.length < 4 || limit <= 0) return [] as ScheduledMatchDefinition[];
  const counts = Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>;
  const maxPerPlayer = Math.max(1, Math.ceil((limit * 4) / ids.length));
  const matchups: ScheduledMatchDefinition[] = [];
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
      matchups.push({ team1, team2, iteration: 1 });
    }
  }

  return matchups.slice(0, limit);
}
