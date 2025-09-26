import { MatchStatus, MatchType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { RatingHistoryMatchInfo, RatingHistoryPoint } from '@/types/rating-history';
import type { ProfileMatch } from '@/types/player-profile';

export type LeaderboardMode = 'overall' | 'singles' | 'doubles';

export interface LeaderboardRow {
  id: string;
  username: string;
  displayName: string;
  glickoRating: number;
  glickoRd: number;
  wins: number;
  losses: number;
  lastMatchAt: string | null;
}

export async function getLeaderboard(
  scope: 'active' | 'all' = 'active',
  mode: LeaderboardMode = 'overall'
): Promise<LeaderboardRow[]> {
  if (mode === 'overall') {
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
        glickoRating: true,
        glickoRd: true,
        wins: true,
        losses: true,
        lastMatchAt: true
      }
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      glickoRating: user.glickoRating,
      glickoRd: user.glickoRd,
      wins: user.wins,
      losses: user.losses,
      lastMatchAt: user.lastMatchAt ? user.lastMatchAt.toISOString() : null
    }));
  }

  const where = scope === 'active' ? { active: true } : {};
  const orderBy = mode === 'singles'
    ? [{ singlesRating: 'desc' as const }, { singlesRd: 'asc' as const }, { displayName: 'asc' as const }]
    : [{ doublesRating: 'desc' as const }, { doublesRd: 'asc' as const }, { displayName: 'asc' as const }];

  const users = await prisma.user.findMany({
    where,
    orderBy,
    select: {
      id: true,
      username: true,
      displayName: true,
      singlesRating: true,
      singlesRd: true,
      singlesWins: true,
      singlesLosses: true,
      singlesLastMatchAt: true,
      doublesRating: true,
      doublesRd: true,
      doublesWins: true,
      doublesLosses: true,
      doublesLastMatchAt: true
    }
  });

  const filtered = users.filter((user) => {
    const wins = mode === 'singles' ? user.singlesWins : user.doublesWins;
    const losses = mode === 'singles' ? user.singlesLosses : user.doublesLosses;
    return wins + losses > 0;
  });

  return filtered.map((user) => {
    const wins = mode === 'singles' ? user.singlesWins : user.doublesWins;
    const losses = mode === 'singles' ? user.singlesLosses : user.doublesLosses;
    const rating = mode === 'singles' ? user.singlesRating : user.doublesRating;
    const rd = mode === 'singles' ? user.singlesRd : user.doublesRd;
    const last = mode === 'singles' ? user.singlesLastMatchAt : user.doublesLastMatchAt;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      glickoRating: rating,
      glickoRd: rd,
      wins,
      losses,
      lastMatchAt: last ? last.toISOString() : null
    };
  });
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
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          },
          team: true
        }
      }
    }
  });

  const ratingTimeline: RatingHistoryPoint[] = player.ratingHistory.map((entry) => {
    const match = entry.match;

    if (!match) {
      return {
        playedAt: entry.playedAt ? entry.playedAt.toISOString() : null,
        rating: entry.rating,
        rd: entry.rd,
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
      playedAt: entry.playedAt ? entry.playedAt.toISOString() : null,
      rating: entry.rating,
      rd: entry.rd,
      matchId: entry.matchId,
      matchInfo
    } satisfies RatingHistoryPoint;
  });

  const serializedMatches: ProfileMatch[] = matches.map((match) => ({
    id: match.id,
    matchType: match.matchType,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    playedAt: match.playedAt.toISOString(),
    participants: match.participants.map((participant) => ({
      id: participant.id,
      userId: participant.userId,
      username: participant.user.username,
      displayName: participant.user.displayName,
      teamNo: participant.team?.teamNo ?? null,
      ratingBefore: participant.ratingBefore,
      ratingAfter: participant.ratingAfter,
      rdBefore: participant.rdBefore,
      rdAfter: participant.rdAfter
    }))
  }));

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

  const summary = {
    id: player.id,
    displayName: player.displayName,
    username: player.username,
    glickoRating: player.glickoRating,
    glickoRd: player.glickoRd,
    wins: player.wins,
    losses: player.losses,
    lastMatchAt: player.lastMatchAt ? player.lastMatchAt.toISOString() : null,
    singlesRating: player.singlesRating,
    singlesRd: player.singlesRd,
    singlesWins: player.singlesWins,
    singlesLosses: player.singlesLosses,
    singlesLastMatchAt: player.singlesLastMatchAt ? player.singlesLastMatchAt.toISOString() : null,
    doublesRating: player.doublesRating,
    doublesRd: player.doublesRd,
    doublesWins: player.doublesWins,
    doublesLosses: player.doublesLosses,
    doublesLastMatchAt: player.doublesLastMatchAt ? player.doublesLastMatchAt.toISOString() : null
  };

  return {
    player,
    summary,
    ratingTimeline,
    matches: serializedMatches,
    headToHead: Array.from(headToHead.values()).sort((a, b) =>
      a.opponent.displayName.localeCompare(b.opponent.displayName, 'ko')
    )
  };
}
