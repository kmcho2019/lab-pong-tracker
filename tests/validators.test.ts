import { describe, expect, it } from 'vitest';
import { matchPayloadSchema } from '@/lib/validators';

describe('matchPayloadSchema', () => {
  const singlesBase = {
    matchType: 'SINGLES' as const,
    team1: ['athlete-1'],
    team2: ['athlete-2'],
    team1Score: 11,
    team2Score: 9
  };

  const doublesBase = {
    matchType: 'DOUBLES' as const,
    team1: ['pair-a-1', 'pair-a-2'],
    team2: ['pair-b-1', 'pair-b-2'],
    team1Score: 11,
    team2Score: 9
  };

  it('accepts a valid singles payload', () => {
    const parsed = matchPayloadSchema.safeParse(singlesBase);
    expect(parsed.success).toBe(true);
  });

  it('accepts a valid doubles payload with custom metadata', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...doublesBase,
      team1Score: 15,
      team2Score: 13,
      targetPoints: 15,
      winByMargin: 1,
      playedAt: '2025-09-18T08:30:00.000Z',
      location: 'Lab lounge table',
      note: 'Friendly lunchtime game'
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects draws', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team1Score: 7,
      team2Score: 7
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate players across teams', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team2: singlesBase.team1
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects singles submissions with extra teammates', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team1: ['athlete-1', 'athlete-3']
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces doubles roster size', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...doublesBase,
      team2: ['pair-b-1']
    });
    expect(parsed.success).toBe(false);
  });

  it('requires the winning team to reach the target score', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team1Score: 9,
      team2Score: 7,
      targetPoints: 11
    });
    expect(parsed.success).toBe(false);
  });

  it('requires the winning team to clear the win-by margin', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team1Score: 11,
      team2Score: 10,
      winByMargin: 2
    });
    expect(parsed.success).toBe(false);
  });

  it('allows deuce scenarios when margin satisfied', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team1Score: 16,
      team2Score: 14,
      targetPoints: 11,
      winByMargin: 2
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts custom win-by and target combination', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...doublesBase,
      team1Score: 21,
      team2Score: 19,
      targetPoints: 21,
      winByMargin: 2
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid player identifiers', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...singlesBase,
      team1: ['bad player id']
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects overly long location text', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...doublesBase,
      location: 'x'.repeat(121)
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects overly long note text', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...doublesBase,
      note: 'y'.repeat(281)
    });
    expect(parsed.success).toBe(false);
  });
});
