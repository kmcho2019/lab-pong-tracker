import { MatchStatus, MatchType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { RatingHistoryMatchInfo, RatingHistoryPoint } from '@/types/rating-history';

export async function getLeaderboard(scope: 'active' | 'all' = 'active') {
  const where = scope === 'active' ? { active: true } : {};
  const users = await prisma.user.findMany({
    where,
    orderBy: [
      { glickoRating: 'desc' },
      { displayName: 'asc' }
    ],
    select: {
      id: true,
      displayName: true,
      username: true,
      image: true,
      glickoRating: true,
      glickoRd: true,
      wins: true,
      losses: true,
      lastMatchAt: true
    }
  });
  return users;
}

export async function getRecentMatches(limit = 50) {
  const matches = await prisma.match.findMany({
    where: { status: MatchStatus.CONFIRMED },
    orderBy: { playedAt: 'desc' },
    take: limit,
    include: {
      participants: {
        include: {
          user: true,
          team: true
        }
      }
    }
  });

  return matches;
}

export async function getMatchDetail(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participants: {
        include: {
          user: true,
          team: true
        }
      },
      auditLogs: true
    }
  });
}

export async function getPlayerProfile(identifier: string) {
  const player = await prisma.user.findFirst({
    where: {
      OR: [{ id: identifier }, { username: identifier }]
    },
    include: {
      ratingHistory: {
        orderBy: { playedAt: 'asc' },
        take: 200,
        include: {
          match: {
            include: {
              participants: {
                include: { user: true, team: true }
              }
            }
          }
        }
      }
    }
  });

  if (!player) return null;

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      participants: {
        some: { userId: player.id }
      }
    },
    orderBy: { playedAt: 'desc' },
    take: 100,
    include: {
      participants: {
        include: { user: true, team: true }
      }
    }
  });

  const ratingTimeline: RatingHistoryPoint[] = player.ratingHistory.map((entry) => {
    const match = entry.match;

    if (!match) {
      return {
        playedAt: entry.playedAt,
        rating: entry.rating,
        matchId: entry.matchId,
        matchInfo: null
      } satisfies RatingHistoryPoint;
    }

    const team1 = match.participants.filter((participant) => participant.team?.teamNo === 1);
    const team2 = match.participants.filter((participant) => participant.team?.teamNo === 2);
    const playerOnTeam1 = team1.some((participant) => participant.userId === player.id);
    const playerTeam = playerOnTeam1 ? team1 : team2;
    const opponentTeam = playerOnTeam1 ? team2 : team1;
    const didWin = (playerOnTeam1 ? match.team1Score : match.team2Score) > (playerOnTeam1 ? match.team2Score : match.team1Score);

    const matchInfo: RatingHistoryMatchInfo = {
      id: match.id,
      score: `${match.team1Score} – ${match.team2Score}`,
      result: didWin ? 'Win' : 'Loss',
      matchType: match.matchType,
      opponents: opponentTeam.map((participant) => participant.user.displayName),
      teammates: playerTeam
        .filter((participant) => participant.userId !== player.id)
        .map((participant) => participant.user.displayName)
    };

    return {
      playedAt: entry.playedAt,
      rating: entry.rating,
      matchId: entry.matchId,
      matchInfo
    } satisfies RatingHistoryPoint;
  });

  const headToHead = new Map<
    string,
    {
      opponent: {
        id: string;
        displayName: string;
        username: string;
      };
      wins: number;
      losses: number;
      singlesWins: number;
      singlesLosses: number;
      lastPlayedAt: Date;
    }
  >();

  for (const match of matches) {
    const team1 = match.participants.filter((participant) => participant.team?.teamNo === 1);
    const team2 = match.participants.filter((participant) => participant.team?.teamNo === 2);
    const playerOnTeam1 = team1.some((participant) => participant.userId === player.id);
    const playerTeam = playerOnTeam1 ? team1 : team2;
    const opponentTeam = playerOnTeam1 ? team2 : team1;
    const didWin = (playerOnTeam1 ? match.team1Score : match.team2Score) > (playerOnTeam1 ? match.team2Score : match.team1Score);
    const isSingles = match.matchType === MatchType.SINGLES;

    for (const opponent of opponentTeam) {
      const record = headToHead.get(opponent.userId) ?? {
        opponent: {
          id: opponent.user.id,
          displayName: opponent.user.displayName,
          username: opponent.user.username
        },
        wins: 0,
        losses: 0,
        singlesWins: 0,
        singlesLosses: 0,
        lastPlayedAt: match.playedAt
      };
      if (didWin) {
        record.wins += 1;
        if (isSingles) record.singlesWins += 1;
      } else {
        record.losses += 1;
        if (isSingles) record.singlesLosses += 1;
      }
      record.lastPlayedAt = match.playedAt;
      headToHead.set(opponent.userId, record);
    }
  }

  return {
    player,
    ratingTimeline,
    matches,
    headToHead: Array.from(headToHead.values()).sort((a, b) => a.opponent.displayName.localeCompare(b.opponent.displayName, 'ko'))
  };
}
