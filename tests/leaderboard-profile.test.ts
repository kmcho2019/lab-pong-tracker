import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchType } from '@prisma/client';

vi.mock('@/lib/prisma', () => {
  const user = {
    findMany: vi.fn(),
    findFirst: vi.fn()
  };
  const match = {
    findMany: vi.fn()
  };
  return {
    prisma: {
      user,
      match
    }
  };
});

import { prisma } from '@/lib/prisma';
import { getLeaderboard, getPlayerProfile, type LeaderboardMode } from '@/server/league-service';

const prismaMock = prisma as unknown as {
  user: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  match: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const baseUser = {
  id: 'user-1',
  username: 'alpha',
  displayName: 'Alpha Player',
  singlesRating: 1520,
  singlesRd: 60,
  singlesWins: 10,
  singlesLosses: 4,
  singlesLastMatchAt: new Date('2025-09-10T12:00:00Z'),
  doublesRating: 1480,
  doublesRd: 75,
  doublesWins: 6,
  doublesLosses: 8,
  doublesLastMatchAt: new Date('2025-09-05T09:00:00Z'),
  glickoRating: 1505,
  glickoRd: 65,
  wins: 18,
  losses: 12,
  lastMatchAt: new Date('2025-09-12T06:00:00Z'),
  active: true
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getLeaderboard', () => {
  it.each<LeaderboardMode>(['overall', 'singles', 'doubles'])('returns distinct rows for %s mode', async (mode) => {
    if (mode === 'overall') {
      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: baseUser.id,
          username: baseUser.username,
          displayName: baseUser.displayName,
          glickoRating: baseUser.glickoRating,
          glickoRd: baseUser.glickoRd,
          wins: baseUser.wins,
          losses: baseUser.losses,
          lastMatchAt: baseUser.lastMatchAt
        }
      ]);
    } else {
      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: baseUser.id,
          username: baseUser.username,
          displayName: baseUser.displayName,
          singlesRating: baseUser.singlesRating,
          singlesRd: baseUser.singlesRd,
          singlesWins: baseUser.singlesWins,
          singlesLosses: baseUser.singlesLosses,
          singlesLastMatchAt: baseUser.singlesLastMatchAt,
          doublesRating: baseUser.doublesRating,
          doublesRd: baseUser.doublesRd,
          doublesWins: baseUser.doublesWins,
          doublesLosses: baseUser.doublesLosses,
          doublesLastMatchAt: baseUser.doublesLastMatchAt,
          active: true
        }
      ]);
    }

    const rows = await getLeaderboard('all', mode);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    if (mode === 'overall') {
      expect(row.glickoRating).toBe(baseUser.glickoRating);
      expect(row.wins).toBe(baseUser.wins);
    } else if (mode === 'singles') {
      expect(row.glickoRating).toBe(baseUser.singlesRating);
      expect(row.glickoRating).not.toBe(baseUser.glickoRating);
      expect(row.wins).toBe(baseUser.singlesWins);
    } else {
      expect(row.glickoRating).toBe(baseUser.doublesRating);
      expect(row.wins).toBe(baseUser.doublesWins);
    }
  });
});

describe('getPlayerProfile', () => {
  it('summarises per-mode ratings and builds timeline metadata', async () => {
    const matchStub = {
      id: 'match-1',
      matchType: MatchType.SINGLES,
      team1Score: 11,
      team2Score: 7,
      participants: [
        {
          userId: baseUser.id,
          team: { teamNo: 1 },
          user: { displayName: baseUser.displayName }
        },
        {
          userId: 'opponent-1',
          team: { teamNo: 2 },
          user: { displayName: 'Opponent One' }
        }
      ]
    };

    prismaMock.user.findFirst.mockResolvedValueOnce({
      ...baseUser,
      ratingHistory: [
        {
          matchId: 'match-1',
          playedAt: new Date('2025-09-01T10:00:00Z'),
          rating: 1510,
          rd: 58,
          deltaMu: (1510 - 1500) / 173.7178,
          deltaSigma: 0,
          mode: 'OVERALL',
          match: matchStub
        },
        {
          matchId: 'match-1',
          playedAt: new Date('2025-09-01T10:00:00Z'),
          rating: 1520,
          rd: 52,
          deltaMu: (1520 - 1500) / 173.7178,
          deltaSigma: 0,
          mode: 'SINGLES',
          match: matchStub
        }
      ]
    });

    prismaMock.match.findMany.mockResolvedValueOnce([
      {
        id: 'match-1',
        matchType: MatchType.SINGLES,
        team1Score: 11,
        team2Score: 7,
        playedAt: new Date('2025-09-01T10:00:00Z'),
        participants: [
          {
            id: 'p1',
            userId: baseUser.id,
            username: baseUser.username,
            displayName: baseUser.displayName,
            team: { teamNo: 1 },
            teamNo: 1,
            ratingBefore: 1500,
            ratingAfter: 1510,
            rdBefore: 60,
            rdAfter: 58,
            user: { username: baseUser.username }
          },
          {
            id: 'p2',
            userId: 'opponent-1',
            username: 'opponent-1',
            displayName: 'Opponent One',
            team: { teamNo: 2 },
            teamNo: 2,
            ratingBefore: 1490,
            ratingAfter: 1480,
            rdBefore: 62,
            rdAfter: 63,
            user: { username: 'opponent-1' }
          }
        ]
      }
    ]);

    const profile = await getPlayerProfile(baseUser.id);
    expect(profile).not.toBeNull();
    const summary = profile!.summary;

    expect(summary.glickoRating).toBe(baseUser.glickoRating);
    expect(summary.singlesRating).toBe(baseUser.singlesRating);
    expect(summary.doublesRating).toBe(baseUser.doublesRating);

    const timeline = profile!.ratingTimeline;
    expect(timeline).toHaveLength(2);
    const overallPoint = timeline.find((point) => point.mode === 'overall');
    const singlesPoint = timeline.find((point) => point.mode === 'singles');
    expect(overallPoint?.matchInfo?.result).toBe('Win');
    expect(overallPoint?.matchInfo?.opponents).toEqual(['Opponent One']);
    expect(overallPoint?.rd).toBe(58);
    expect(overallPoint?.rating).toBe(1510);
    expect(singlesPoint?.rating).toBe(1520);
    expect(singlesPoint?.rd).toBe(52);

    const matchParticipant = profile!.matches[0].participants.find((participant) => participant.userId === baseUser.id);
    expect(matchParticipant?.modeRatings?.singles?.ratingAfter).toBe(1520);
    expect(matchParticipant?.modeRatings?.overall?.ratingAfter).toBe(1510);
  });
});
