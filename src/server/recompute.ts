import { MatchStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { applyRatingsForMatch } from './rating-engine';

export async function recomputeLeague(fromDate?: Date) {
  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      ...(fromDate ? { playedAt: { gte: fromDate } } : {})
    },
    orderBy: { playedAt: 'asc' },
    select: { id: true }
  });

  await prisma.$transaction(async (tx) => {
    await tx.ratingHistory.deleteMany({});
    await tx.matchParticipant.updateMany({
      data: {
        ratingBefore: null,
        ratingAfter: null,
        rdBefore: null,
        rdAfter: null
      }
    });
    await tx.user.updateMany({
      data: {
        glickoRating: 1500,
        glickoRd: 350,
        glickoVolatility: 0.06,
        wins: 0,
        losses: 0,
        lastMatchAt: null,
        singlesRating: 1500,
        singlesRd: 350,
        singlesVolatility: 0.06,
        singlesWins: 0,
        singlesLosses: 0,
        singlesLastMatchAt: null,
        doublesRating: 1500,
        doublesRd: 350,
        doublesVolatility: 0.06,
        doublesWins: 0,
        doublesLosses: 0,
        doublesLastMatchAt: null
      }
    });
  });

  for (const match of matches) {
    await applyRatingsForMatch(match.id);
  }
}
