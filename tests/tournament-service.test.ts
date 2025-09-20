import { afterEach, describe, expect, it, vi } from 'vitest';
import { distributeIntoGroups, generateSinglesPairings, generateDoublesPairings } from '@/server/tournament-service';

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
