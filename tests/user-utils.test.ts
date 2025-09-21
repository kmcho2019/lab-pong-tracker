import { describe, expect, it, vi } from 'vitest';
import {
  computeInitialRatings,
  generateUniqueUsername,
  normalizeUsername,
  slugFromDisplayName,
  validateDisplayName
} from '@/server/user-utils';

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

describe('validateDisplayName', () => {
  it('trims and normalises names', () => {
    expect(validateDisplayName('  Alex Kim  ')).toBe('Alex Kim');
  });

  it('rejects empty names', () => {
    expect(() => validateDisplayName('   ')).toThrow('Display name cannot be empty.');
  });
});

describe('normalizeUsername', () => {
  it('auto-generates slug when blank', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const handle = await normalizeUsername(prisma as any, '', { currentUserId: 'u1', displayName: 'Alex Kim' });
    expect(handle).toBe('alex-kim');
  });

  it('keeps existing handle if unchanged', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', username: 'alex' }) } };
    await expect(normalizeUsername(prisma as any, 'alex', { currentUserId: 'u1', displayName: 'Alex' })).resolves.toBe('alex');
  });

  it('rejects conflicting handles', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 'other', username: 'alex' }) } };
    await expect(normalizeUsername(prisma as any, 'alex', { currentUserId: 'u1', displayName: 'Alex' })).rejects.toThrow(
      'Handle is already taken.'
    );
  });

  it('enforces format rules', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(normalizeUsername(prisma as any, 'Bad Handle!', { currentUserId: 'u1', displayName: 'Alex' })).rejects.toThrow(
      'Handles must be 3-32 characters'
    );
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
