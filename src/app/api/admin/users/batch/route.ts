import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { computeInitialRatings, generateUniqueUsername, normalizeDisplayName } from '@/server/user-utils';

const userSeedSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  initialRating: z.number().min(0).max(4000).optional(),
  initialRd: z.number().min(30).max(500).optional(),
  initialVolatility: z.number().min(0.01).max(1).optional(),
  initialSinglesRating: z.number().min(0).max(4000).optional(),
  initialSinglesRd: z.number().min(30).max(500).optional(),
  initialSinglesVolatility: z.number().min(0.01).max(1).optional(),
  initialDoublesRating: z.number().min(0).max(4000).optional(),
  initialDoublesRd: z.number().min(30).max(500).optional(),
  initialDoublesVolatility: z.number().min(0.01).max(1).optional()
});

const requestSchema = z.object({
  users: z.array(userSeedSchema).min(1),
  onDuplicate: z.enum(['skip', 'update']).default('skip')
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => undefined);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { users, onDuplicate } = parsed.data;
  const results: Array<{ email: string; status: 'created' | 'updated' | 'skipped'; message?: string }> = [];
  const takenUsernames = new Set<string>();

  for (const seed of users) {
    const normalizedEmail = seed.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existing && onDuplicate === 'skip') {
      results.push({ email: normalizedEmail, status: 'skipped', message: 'User already exists' });
      continue;
    }

    const displayName = normalizeDisplayName(seed.displayName);

    if (existing && onDuplicate === 'update') {
      takenUsernames.add(existing.username);
      const ratings = computeInitialRatings({
        initialRating: seed.initialRating,
        initialRd: seed.initialRd,
        initialVolatility: seed.initialVolatility,
        initialSinglesRating: seed.initialSinglesRating,
        initialSinglesRd: seed.initialSinglesRd,
        initialSinglesVolatility: seed.initialSinglesVolatility,
        initialDoublesRating: seed.initialDoublesRating,
        initialDoublesRd: seed.initialDoublesRd,
        initialDoublesVolatility: seed.initialDoublesVolatility
      });

      await prisma.user.update({
        where: { email: normalizedEmail },
        data: {
          displayName,
          role: seed.role ?? existing.role,
          active: seed.active ?? existing.active,
          glickoRating: ratings.overall.rating,
          glickoRd: ratings.overall.rd,
          glickoVolatility: ratings.overall.volatility,
          singlesRating: ratings.singles.rating,
          singlesRd: ratings.singles.rd,
          singlesVolatility: ratings.singles.volatility,
          doublesRating: ratings.doubles.rating,
          doublesRd: ratings.doubles.rd,
          doublesVolatility: ratings.doubles.volatility
        }
      });

      results.push({ email: normalizedEmail, status: 'updated' });
      continue;
    }

    const username = await generateUniqueUsername(prisma, displayName, takenUsernames);
    const ratings = computeInitialRatings({
      initialRating: seed.initialRating,
      initialRd: seed.initialRd,
      initialVolatility: seed.initialVolatility,
      initialSinglesRating: seed.initialSinglesRating,
      initialSinglesRd: seed.initialSinglesRd,
      initialSinglesVolatility: seed.initialSinglesVolatility,
      initialDoublesRating: seed.initialDoublesRating,
      initialDoublesRd: seed.initialDoublesRd,
      initialDoublesVolatility: seed.initialDoublesVolatility
    });

    await prisma.user.create({
      data: {
        email: normalizedEmail,
        displayName,
        username,
        role: seed.role ?? Role.USER,
        active: seed.active ?? true,
        glickoRating: ratings.overall.rating,
        glickoRd: ratings.overall.rd,
        glickoVolatility: ratings.overall.volatility,
        singlesRating: ratings.singles.rating,
        singlesRd: ratings.singles.rd,
        singlesVolatility: ratings.singles.volatility,
        doublesRating: ratings.doubles.rating,
        doublesRd: ratings.doubles.rd,
        doublesVolatility: ratings.doubles.volatility
      }
    });

    results.push({ email: normalizedEmail, status: 'created' });
  }

  const summary = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { created: 0, updated: 0, skipped: 0 }
  );

  return NextResponse.json({ summary, results }, { status: 201 });
}
