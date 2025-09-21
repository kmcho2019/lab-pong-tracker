import type { PrismaClient } from '@prisma/client';

const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;

const TRUSTED_RD = 100;
const TRUSTED_VOLATILITY = 0.04;

export type RatingSeedInput = {
  initialRating?: number;
  initialRd?: number;
  initialVolatility?: number;
  initialSinglesRating?: number;
  initialSinglesRd?: number;
  initialSinglesVolatility?: number;
  initialDoublesRating?: number;
  initialDoublesRd?: number;
  initialDoublesVolatility?: number;
};

export function normalizeDisplayName(displayName: string) {
  return displayName.trim().normalize('NFC');
}

export function slugFromDisplayName(displayName: string) {
  const normalized = normalizeDisplayName(displayName);
  const base = normalized
    .normalize('NFKD')
    .replace(/[\p{Diacritic}]/gu, '')
    .replace(/[^\p{Script=Hangul}a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .normalize('NFC');

  return base || `player-${Math.random().toString(36).slice(2, 8)}`;
}

export async function generateUniqueUsername(
  prisma: Pick<PrismaClient, 'user'>,
  displayName: string,
  taken: Set<string> = new Set()
) {
  const base = slugFromDisplayName(displayName);
  let attempt = 0;
  let candidate = base;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!taken.has(candidate)) {
      const existing = await prisma.user.findUnique({ where: { username: candidate } });
      if (!existing) {
        taken.add(candidate);
        return candidate;
      }
    }

    attempt += 1;
    candidate = `${base}-${attempt}`;

    if (attempt > 20) {
      candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
  }
}

const USERNAME_REGEX = /^[a-z0-9][a-z0-9-_]{1,30}[a-z0-9]$/;

export function validateDisplayName(displayName: string) {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) {
    throw new Error('Display name cannot be empty.');
  }
  if (normalized.length > 80) {
    throw new Error('Display name must be 80 characters or fewer.');
  }
  return normalized;
}

export async function normalizeUsername(
  prisma: Pick<PrismaClient, 'user'>,
  desiredUsername: string,
  options: { currentUserId: string; displayName: string }
) {
  const trimmed = (desiredUsername ?? '').trim();

  if (!trimmed) {
    return generateUniqueUsername(prisma, options.displayName);
  }

  const normalized = trimmed.toLowerCase();
  if (!USERNAME_REGEX.test(normalized)) {
    throw new Error('Handles must be 3-32 characters, lowercase, and may include hyphens/underscores.');
  }

  const collision = await prisma.user.findUnique({ where: { username: normalized } });
  if (collision && collision.id !== options.currentUserId) {
    throw new Error('Handle is already taken.');
  }

  return normalized;
}

export function computeInitialRatings(input: RatingSeedInput) {
  const baseRatingProvided = input.initialRating !== undefined;
  const singlesRatingProvided = input.initialSinglesRating !== undefined;
  const doublesRatingProvided = input.initialDoublesRating !== undefined;

  const overallRating = input.initialRating ?? DEFAULT_RATING;
  const overallRd = input.initialRd ?? (baseRatingProvided ? TRUSTED_RD : DEFAULT_RD);
  const overallVolatility = input.initialVolatility ?? (baseRatingProvided ? TRUSTED_VOLATILITY : DEFAULT_VOLATILITY);

  const singlesRating = input.initialSinglesRating ?? input.initialRating ?? DEFAULT_RATING;
  const singlesRd = input.initialSinglesRd ?? input.initialRd ?? (singlesRatingProvided || baseRatingProvided ? TRUSTED_RD : DEFAULT_RD);
  const singlesVolatility =
    input.initialSinglesVolatility ??
    input.initialVolatility ??
    (singlesRatingProvided || baseRatingProvided ? TRUSTED_VOLATILITY : DEFAULT_VOLATILITY);

  const doublesRating = input.initialDoublesRating ?? input.initialRating ?? DEFAULT_RATING;
  const doublesRd = input.initialDoublesRd ?? input.initialRd ?? (doublesRatingProvided || baseRatingProvided ? TRUSTED_RD : DEFAULT_RD);
  const doublesVolatility =
    input.initialDoublesVolatility ??
    input.initialVolatility ??
    (doublesRatingProvided || baseRatingProvided ? TRUSTED_VOLATILITY : DEFAULT_VOLATILITY);

  return {
    overall: {
      rating: overallRating,
      rd: overallRd,
      volatility: overallVolatility
    },
    singles: {
      rating: singlesRating,
      rd: singlesRd,
      volatility: singlesVolatility
    },
    doubles: {
      rating: doublesRating,
      rd: doublesRd,
      volatility: doublesVolatility
    }
  };
}
