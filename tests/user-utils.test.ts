import { describe, expect, it, vi } from 'vitest';
import { computeInitialRatings, generateUniqueUsername, slugFromDisplayName } from '@/server/user-utils';

describe('slugFromDisplayName', () => {
  it('normalises diacritics and whitespace', () => {
    expect(slugFromDisplayName('  José Álvarez  ')).toBe('jose-alvarez');
    expect(slugFromDisplayName('김 철수')).toBe('김-철수');
  });

  it('falls back to random slug when nothing remains', () => {
    const value = slugFromDisplayName('!!!');
    expect(value.startsWith('player-')).toBe(true);
  });
});

describe('generateUniqueUsername', () => {
  it('increments suffix when usernames are taken', async () => {
    const existingUsernames = new Set(['alex']);
    const prisma = {
      user: {
        findUnique: vi.fn(({ where: { username } }) =>
          existingUsernames.has(username) ? Promise.resolve({ id: 'u1', username }) : Promise.resolve(null)
        )
      }
    };

    const taken = new Set<string>();
    const first = await generateUniqueUsername(prisma as any, 'Alex', taken);
    expect(first).toBe('alex-1');
    const second = await generateUniqueUsername(prisma as any, 'Alex', taken);
    expect(second).toBe('alex-2');
  });
});

describe('computeInitialRatings', () => {
  it('returns trusted RD when initial ratings supplied', () => {
    const ratings = computeInitialRatings({ initialRating: 1700, initialSinglesRating: 1750 });
    expect(ratings.overall.rating).toBe(1700);
    expect(ratings.overall.rd).toBe(100);
    expect(ratings.singles.rd).toBe(100);
  });

  it('falls back to defaults when nothing supplied', () => {
    const ratings = computeInitialRatings({});
    expect(ratings.overall.rating).toBe(1500);
    expect(ratings.overall.rd).toBe(350);
    expect(ratings.doubles.volatility).toBeCloseTo(0.06);
  });
});
