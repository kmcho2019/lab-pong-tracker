import { describe, expect, it } from 'vitest';
import { glicko2Update, combineTeam, inflateRd } from '@/lib/glicko2';

describe('glicko2Update', () => {
  it('increases rating when player wins against higher rated opponent', () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const opponent = { rating: 1600, rd: 150, score: 1 };

    const result = glicko2Update(player, [opponent]);

    expect(result.rating).toBeGreaterThan(player.rating);
    expect(result.rd).toBeLessThan(player.rd);
  });

  it('decreases rating after loss', () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const opponent = { rating: 1400, rd: 150, score: 0 };

    const result = glicko2Update(player, [opponent]);

    expect(result.rating).toBeLessThan(player.rating);
  });
});

describe('combineTeam', () => {
  it('averages rating and rd for doubles team', () => {
    const alice = { rating: 1500, rd: 120, volatility: 0.06 };
    const bob = { rating: 1600, rd: 140, volatility: 0.06 };

    const team = combineTeam([alice, bob]);

    expect(team.rating).toBeGreaterThanOrEqual(1500);
    expect(team.rating).toBeLessThanOrEqual(1600);
    expect(team.rd).toBeLessThan(Math.max(alice.rd, bob.rd));
  });
});

describe('inflateRd', () => {
  it('increases RD when a player is inactive', () => {
    const player = { rating: 1500, rd: 120, volatility: 0.06 };
    const inactive = inflateRd(player, 4);

    expect(inactive.rd).toBeGreaterThan(player.rd);
    expect(inactive.rating).toEqual(player.rating);
  });
});
