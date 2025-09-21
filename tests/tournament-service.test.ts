import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  distributeIntoGroups,
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
  it('uses serpentine distribution by rating order', () => {
    const participants = [
      { id: 'p1', displayName: 'One' },
      { id: 'p2', displayName: 'Two' },
      { id: 'p3', displayName: 'Three' },
      { id: 'p4', displayName: 'Four' },
      { id: 'p5', displayName: 'Five' },
      { id: 'p6', displayName: 'Six' },
      { id: 'p7', displayName: 'Seven' }
    ];
    const groups = distributeIntoGroups(participants, ['A', 'B', 'C']);
    expect(groups).toHaveLength(3);
    expect(groups[0].participants.map((p) => p.id)).toEqual(['p1', 'p6', 'p7']);
    expect(groups[1].participants.map((p) => p.id)).toEqual(['p2', 'p5']);
    expect(groups[2].participants.map((p) => p.id)).toEqual(['p3', 'p4']);
  });
});

describe('generateSinglesPairings', () => {
  it('produces unique round-robin pairs up to the requested limit', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const pairings = generateSinglesPairings(ids, 3);
    expect(pairings).toHaveLength(3);
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

    const counts = matchCounts(pairings);
    expect(counts.size).toBe(ids.length);
    expect(maxDifference(counts.values())).toBeLessThanOrEqual(1);
  });

  it('allocates everyone evenly with uneven group sizes (5/4 split, 8 matches each)', () => {
    const ninePlayers = Array.from({ length: 9 }, (_, index) => ({
      id: `p${index + 1}`,
      displayName: `Player ${index + 1}`
    }));
    const groups = distributeIntoGroups(ninePlayers, ['A', 'B']);

    expect(groups.map((group) => group.participants.length)).toEqual([5, 4]);

    groups.forEach((group) => {
      const ids = group.participants.map((p) => p.id);
      const pairings = generateSinglesPairings(ids, 8);
      const possiblePairs = (ids.length * (ids.length - 1)) / 2;
      expect(pairings.length).toBeLessThanOrEqual(8);
      expect(pairings.length).toBeLessThanOrEqual(possiblePairs);
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

describe('end-to-end group allocation heuristics', () => {
  it('keeps rating averages similar across groups using serpentine draft', () => {
    const participants = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index + 1}`,
      displayName: `Player ${index + 1}`,
      rating: 2400 - index * 100
    }));

    const groups = distributeIntoGroups(
      participants.map(({ id, displayName }) => ({ id, displayName })),
      ['A', 'B', 'C']
    );

    const ratingsById = new Map(participants.map((p) => [p.id, p.rating]));

    const averages = groups.map((group) => {
      const ratings = group.participants.map((participant) => ratingsById.get(participant.id) ?? 0);
      const total = ratings.reduce((sum, value) => sum + value, 0);
      return total / ratings.length;
    });

    expect(maxDifference(averages)).toBeLessThanOrEqual(220);
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
    expect(pairings).toEqual([{ team1: ['x'], team2: ['y'] }]);

    const empty = generateSinglesPairings(['solo'], 3);
    expect(empty).toEqual([]);
  });
});
