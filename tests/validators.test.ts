import { describe, expect, it } from 'vitest';
import { matchPayloadSchema } from '@/lib/validators';

describe('matchPayloadSchema', () => {
  const basePayload = {
    matchType: 'SINGLES' as const,
    team1: ['ck1234567890123456789012'],
    team2: ['ck2234567890123456789012'],
    team1Score: 11,
    team2Score: 9
  };

  it('accepts a valid singles payload', () => {
    const parsed = matchPayloadSchema.safeParse(basePayload);
    expect(parsed.success).toBe(true);
  });

  it('rejects draws', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...basePayload,
      team1Score: 11,
      team2Score: 11
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate players across teams', () => {
    const parsed = matchPayloadSchema.safeParse({
      ...basePayload,
      team2: basePayload.team1
    });
    expect(parsed.success).toBe(false);
  });

  it('validates doubles roster size', () => {
    const doubles = {
      matchType: 'DOUBLES' as const,
      team1: ['ck1234567890123456789012', 'ck1234567890123456789013'],
      team2: ['ck2234567890123456789012'],
      team1Score: 11,
      team2Score: 9
    };
    const parsed = matchPayloadSchema.safeParse(doubles);
    expect(parsed.success).toBe(false);
  });
});
