import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentMatchStatus, TournamentMode } from '@prisma/client';
import {
  distributeIntoGroups,
  generateCompetitiveDoublesSchedule,
  generateCompetitiveSinglesSchedule,
  calculatePlacementsForGroup,
  generateSinglesPairings,
  generateDoublesPairings
} from '@/server/tournament-service';

function matchCounts(pairings: Array<{ team1: string[]; team2: string[] }>) {
  const counts = new Map<string, number>();
  pairings.forEach((pair) => {
    pair.team1.concat(pair.team2).forEach((id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
  });
  return counts;
}

function maxDifference(values: Iterable<number>) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return max - min;
}

describe('distributeIntoGroups', () => {
  it('segments sorted participants into contiguous rating bands', () => {
    const participants = [
      { id: 'p1', displayName: 'One', rating: 2100 },
      { id: 'p2', displayName: 'Two', rating: 2050 },
      { id: 'p3', displayName: 'Three', rating: 2000 },
      { id: 'p4', displayName: 'Four', rating: 1950 },
      { id: 'p5', displayName: 'Five', rating: 1900 },
      { id: 'p6', displayName: 'Six', rating: 1850 },
      { id: 'p7', displayName: 'Seven', rating: 1800 }
    ];
    const groups = distributeIntoGroups(participants, ['A', 'B', 'C']);
    expect(groups).toHaveLength(3);
    expect(groups[0].participants.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(groups[1].participants.map((p) => p.id)).toEqual(['p4', 'p5']);
    expect(groups[2].participants.map((p) => p.id)).toEqual(['p6', 'p7']);
    const ranges = groups.map((group) => {
      const ratings = group.participants.map((p) => p.rating);
      return Math.max(...ratings) - Math.min(...ratings);
    });
    expect(Math.max(...ranges)).toBeLessThanOrEqual(200);
  });
});

describe('generateSinglesPairings', () => {
  it('produces unique round-robin pairs up to the requested limit', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const pairings = generateSinglesPairings(ids, 3);
    expect(pairings).toHaveLength(3);
    expect(pairings.every((match) => match.iteration === 1)).toBe(true);
    const seen = new Set(pairings.map((match) => `${match.team1[0]}-${match.team2[0]}`));
    expect(seen.size).toBe(3);
    pairings.forEach((match) => {
      expect(match.team1).toHaveLength(1);
      expect(match.team2).toHaveLength(1);
      expect(match.team1[0]).not.toBe(match.team2[0]);
    });
  });

  it('keeps per-player match counts balanced when the limit truncates the final round', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const pairings = generateSinglesPairings(ids, 8); // 8 < C(5,2)=10
    expect(pairings).toHaveLength(8);
    expect(pairings.every((match) => match.iteration === 1)).toBe(true);

    const counts = matchCounts(pairings);
    expect(counts.size).toBe(ids.length);
    expect(maxDifference(counts.values())).toBeLessThanOrEqual(1);
  });

  it('allocates everyone evenly with uneven group sizes (5/4 split, 8 matches each)', () => {
    const ninePlayers = Array.from({ length: 9 }, (_, index) => ({
      id: `p${index + 1}`,
      displayName: `Player ${index + 1}`,
      rating: 2400 - index * 50
    }));
    const groups = distributeIntoGroups(ninePlayers, ['A', 'B']);

    expect(groups.map((group) => group.participants.length)).toEqual([5, 4]);

    groups.forEach((group) => {
      const ids = group.participants.map((p) => p.id);
      const pairings = generateSinglesPairings(ids, 8);
      const possiblePairs = (ids.length * (ids.length - 1)) / 2;
      expect(pairings.length).toBeLessThanOrEqual(8);
      expect(pairings.length).toBeLessThanOrEqual(possiblePairs);
      expect(pairings.every((match) => match.iteration === 1)).toBe(true);
      expect(maxDifference(matchCounts(pairings).values())).toBeLessThanOrEqual(1);
    });
  });
});

describe('generateDoublesPairings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds balanced unique doubles matchups', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const sequence = [0.1, 0.7, 0.3, 0.9, 0.2, 0.8, 0.4, 0.6];
    let index = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const value = sequence[index % sequence.length];
      index += 1;
      return value;
    });

    const pairings = generateDoublesPairings(ids, 3);
    expect(pairings.length).toBeGreaterThan(0);
    expect(pairings.every((match) => match.iteration === 1)).toBe(true);
    pairings.forEach((match) => {
      expect(match.team1).toHaveLength(2);
      expect(match.team2).toHaveLength(2);
      const all = [...match.team1, ...match.team2];
      expect(new Set(all).size).toBe(4);
    });

    const counts = new Map<string, number>();
    pairings.forEach((match) => {
      match.team1.concat(match.team2).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    const maxPerPlayer = Math.ceil((pairings.length * 4) / ids.length);
    counts.forEach((value) => {
      expect(value).toBeLessThanOrEqual(maxPerPlayer);
    });
  });
});

describe('generateCompetitiveSinglesSchedule', () => {
  it('creates full round robin iterations with alternating home order', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const matches = generateCompetitiveSinglesSchedule(ids, 2);
    const expectedPerIteration = (ids.length * (ids.length - 1)) / 2;
    expect(matches).toHaveLength(expectedPerIteration * 2);

    const counts = matchCounts(matches);
    counts.forEach((value) => {
      expect(value).toBe((ids.length - 1) * 2);
    });

    const iterationOne = matches.filter((match) => match.iteration === 1);
    const iterationTwo = matches.filter((match) => match.iteration === 2);
    const canonical = (match: { team1: string[]; team2: string[] }) =>
      [match.team1[0], match.team2[0]].sort().join('-');
    expect(new Set(iterationOne.map(canonical)).size).toBe(expectedPerIteration);
    expect(new Set(iterationTwo.map(canonical)).size).toBe(expectedPerIteration);

    iterationOne.forEach((match) => {
      const reversed = iterationTwo.find(
        (candidate) =>
          candidate.team1[0] === match.team2[0] && candidate.team2[0] === match.team1[0]
      );
      expect(reversed).toBeDefined();
    });
  });
});

describe('generateCompetitiveDoublesSchedule', () => {
  it('locks balanced teams and schedules round robin play', () => {
    const participants = [
      { id: 'p1', rating: 2100 },
      { id: 'p2', rating: 2050 },
      { id: 'p3', rating: 1980 },
      { id: 'p4', rating: 1960 },
      { id: 'p5', rating: 1890 },
      { id: 'p6', rating: 1820 }
    ];
    const matches = generateCompetitiveDoublesSchedule(participants, 1);
    expect(matches).toHaveLength(3);

    const teams = new Set<string>();
    matches.forEach((match) => {
      teams.add(match.team1.slice().sort().join('-'));
      teams.add(match.team2.slice().sort().join('-'));
      match.team1.concat(match.team2).forEach((id) => expect(id).toMatch(/^p/));
    });

    expect(teams).toEqual(
      new Set(['p1-p6', 'p2-p5', 'p3-p4'])
    );
  });

  it('throws when participants list is not even', () => {
    expect(() =>
      generateCompetitiveDoublesSchedule(
        [
          { id: 'p1', rating: 2100 },
          { id: 'p2', rating: 2050 },
          { id: 'p3', rating: 2000 },
          { id: 'p4', rating: 1980 },
          { id: 'p5', rating: 1930 }
        ],
        1
      )
    ).toThrow('Competitive doubles scheduling requires an even number of participants.');
  });
});

describe('calculatePlacementsForGroup', () => {
  it('ranks singles players by wins then point differential', () => {
    const placements = calculatePlacementsForGroup(
      TournamentMode.SINGLES,
      [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }],
      [
        {
          team1Ids: ['a'],
          team2Ids: ['b'],
          status: TournamentMatchStatus.PLAYED,
          resultMatch: { team1Score: 11, team2Score: 8 }
        },
        {
          team1Ids: ['a'],
          team2Ids: ['c'],
          status: TournamentMatchStatus.PLAYED,
          resultMatch: { team1Score: 9, team2Score: 11 }
        },
        {
          team1Ids: ['b'],
          team2Ids: ['c'],
          status: TournamentMatchStatus.PLAYED,
          resultMatch: { team1Score: 11, team2Score: 7 }
        }
      ]
    );

    const byId = new Map(placements.map((placement) => [placement.teamIds.join(), placement]));
    expect(byId.get('a')?.wins).toBe(1);
    expect(byId.get('a')?.losses).toBe(1);
    expect(byId.get('a')?.rank).toBe(1);
    expect(byId.get('b')?.rank).toBe(2);
    expect(byId.get('c')?.rank).toBe(3);
  });

  it('keeps doubles team standings in sync with played matches', () => {
    const placements = calculatePlacementsForGroup(
      TournamentMode.DOUBLES,
      [],
      [
        {
          team1Ids: ['a', 'd'],
          team2Ids: ['b', 'c'],
          status: TournamentMatchStatus.PLAYED,
          resultMatch: { team1Score: 11, team2Score: 9 }
        },
        {
          team1Ids: ['a', 'd'],
          team2Ids: ['e', 'f'],
          status: TournamentMatchStatus.SCHEDULED,
          resultMatch: null
        }
      ]
    );

    const first = placements.find((placement) => placement.teamIds.join('-') === 'a-d');
    expect(first?.wins).toBe(1);
    expect(first?.matchesPlayed).toBe(1);
    expect(first?.rank).toBe(1);
  });
});

describe('end-to-end group allocation heuristics', () => {
  it('keeps rating averages similar across groups using serpentine draft', () => {
    const participants = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index + 1}`,
      displayName: `Player ${index + 1}`,
      rating: 2400 - index * 100
    }));

    const groups = distributeIntoGroups(participants, ['A', 'B', 'C']);

    const ratingsById = new Map(participants.map((p) => [p.id, p.rating]));

    const ranges = groups.map((group) => {
      const ratings = group.participants.map((participant) => ratingsById.get(participant.id) ?? 0);
      return Math.max(...ratings) - Math.min(...ratings);
    });

    ranges.forEach((spread) => expect(spread).toBeLessThanOrEqual(400));
    const sizes = groups.map((group) => group.participants.length);
    expect(maxDifference(sizes)).toBeLessThanOrEqual(1);
  });

  it('covers all possible combinations when the requested limit is high', () => {
    const players = ['a', 'b', 'c', 'd'];
    const pairings = generateSinglesPairings(players, 20);
    expect(pairings).toHaveLength(6);
    const counts = matchCounts(pairings);
    expect(counts.size).toBe(players.length);
    expect(maxDifference(counts.values())).toBeLessThanOrEqual(1);
  });

  it('handles minimal groups gracefully', () => {
    const pairings = generateSinglesPairings(['x', 'y'], 5);
    expect(pairings).toEqual([{ team1: ['x'], team2: ['y'], iteration: 1 }]);

    const empty = generateSinglesPairings(['solo'], 3);
    expect(empty).toEqual([]);
  });
});
