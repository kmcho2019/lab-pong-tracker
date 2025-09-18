import { MatchStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { combineTeam, glicko2Update, type RatingState } from '@/lib/glicko2';

function buildRatingState(user: {
  glickoRating: number;
  glickoRd: number;
  glickoVolatility: number;
}): RatingState {
  return {
    rating: user.glickoRating,
    rd: user.glickoRd,
    volatility: user.glickoVolatility
  };
}

export async function applyRatingsForMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participants: {
        include: {
          user: true,
          team: true
        }
      },
      teams: true
    }
  });

  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  if (match.status !== MatchStatus.CONFIRMED) {
    throw new Error(`Match ${matchId} must be confirmed before ratings apply`);
  }

  const team1Participants = match.participants.filter((participant) => participant.team?.teamNo === 1);
  const team2Participants = match.participants.filter((participant) => participant.team?.teamNo === 2);

  if (!team1Participants.length || !team2Participants.length) {
    throw new Error('Match is missing participants for one of the teams');
  }

  const team1State = combineTeam(team1Participants.map((participant) => buildRatingState(participant.user)));
  const team2State = combineTeam(team2Participants.map((participant) => buildRatingState(participant.user)));

  const team1Won = match.team1Score > match.team2Score;
  const team2Won = match.team2Score > match.team1Score;

  await prisma.$transaction(async (tx) => {
    const timestamp = match.playedAt;

    for (const participant of match.participants) {
      const user = participant.user;
      const isTeam1 = participant.team?.teamNo === 1;
      const result = team1Won && isTeam1 ? 1 : team2Won && !isTeam1 ? 1 : 0;
      const opponent = isTeam1 ? team2State : team1State;
      const update = glicko2Update(buildRatingState(user), [
        {
          rating: opponent.rating,
          rd: opponent.rd,
          score: result
        }
      ]);

      await tx.matchParticipant.update({
        where: { id: participant.id },
        data: {
          ratingBefore: user.glickoRating,
          ratingAfter: update.rating,
          rdBefore: user.glickoRd,
          rdAfter: update.rd
        }
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          glickoRating: update.rating,
          glickoRd: update.rd,
          glickoVolatility: update.volatility,
          wins: {
            increment: result === 1 ? 1 : 0
          },
          losses: {
            increment: result === 0 ? 1 : 0
          },
          lastMatchAt: timestamp
        }
      });

      await tx.ratingHistory.create({
        data: {
          userId: user.id,
          matchId: match.id,
          rating: update.rating,
          rd: update.rd,
          volatility: update.volatility,
          deltaMu: update.deltaMu,
          deltaSigma: update.deltaSigma,
          playedAt: timestamp
        }
      });
    }
  });
}
