import { MatchStatus, MatchType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { combineTeam, glicko2Update, type RatingState } from '@/lib/glicko2';

type Mode = 'overall' | 'singles' | 'doubles';

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

function buildModeState(
  user: any,
  mode: Mode
): RatingState {
  switch (mode) {
    case 'singles':
      return {
        rating: user.singlesRating ?? 1500,
        rd: user.singlesRd ?? 350,
        volatility: user.singlesVolatility ?? 0.06
      };
    case 'doubles':
      return {
        rating: user.doublesRating ?? 1500,
        rd: user.doublesRd ?? 350,
        volatility: user.doublesVolatility ?? 0.06
      };
    default:
      return buildRatingState(user);
  }
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

  const team1OverallState = combineTeam(team1Participants.map((participant) => buildModeState(participant.user, 'overall')));
  const team2OverallState = combineTeam(team2Participants.map((participant) => buildModeState(participant.user, 'overall')));

  const team1SinglesState = match.matchType === MatchType.SINGLES
    ? combineTeam(team1Participants.map((participant) => buildModeState(participant.user, 'singles')))
    : null;
  const team2SinglesState = match.matchType === MatchType.SINGLES
    ? combineTeam(team2Participants.map((participant) => buildModeState(participant.user, 'singles')))
    : null;

  const team1DoublesState = match.matchType === MatchType.DOUBLES
    ? combineTeam(team1Participants.map((participant) => buildModeState(participant.user, 'doubles')))
    : null;
  const team2DoublesState = match.matchType === MatchType.DOUBLES
    ? combineTeam(team2Participants.map((participant) => buildModeState(participant.user, 'doubles')))
    : null;

  const team1Won = match.team1Score > match.team2Score;
  const team2Won = match.team2Score > match.team1Score;

  await prisma.$transaction(async (tx) => {
    const timestamp = match.playedAt;
    const ratingSnapshots: Array<{
      userId: string;
      username: string;
      displayName: string;
      outcome: 'WIN' | 'LOSS';
      before: { rating: number; rd: number };
      after: { rating: number; rd: number };
    }> = [];

    for (const participant of match.participants) {
      const user = participant.user;
      const isTeam1 = participant.team?.teamNo === 1;
      const result = team1Won && isTeam1 ? 1 : team2Won && !isTeam1 ? 1 : 0;
      const opponentOverall = isTeam1 ? team2OverallState : team1OverallState;
      const updateOverall = glicko2Update(buildModeState(user, 'overall'), [
        {
          rating: opponentOverall.rating,
          rd: opponentOverall.rd,
          score: result
        }
      ]);

      await tx.matchParticipant.update({
        where: { id: participant.id },
        data: {
          ratingBefore: user.glickoRating,
          ratingAfter: updateOverall.rating,
          rdBefore: user.glickoRd,
          rdAfter: updateOverall.rd
        }
      });

      const userUpdate: any = {
        where: { id: user.id },
        data: {
          glickoRating: updateOverall.rating,
          glickoRd: updateOverall.rd,
          glickoVolatility: updateOverall.volatility,
          wins: {
            increment: result === 1 ? 1 : 0
          },
          losses: {
            increment: result === 0 ? 1 : 0
          },
          lastMatchAt: timestamp
        }
      };

      if (match.matchType === MatchType.SINGLES && team1SinglesState && team2SinglesState) {
        const opponentSingles = isTeam1 ? team2SinglesState : team1SinglesState;
        const singlesUpdate = glicko2Update(buildModeState(user, 'singles'), [
          {
            rating: opponentSingles.rating,
            rd: opponentSingles.rd,
            score: result
          }
        ]);

        Object.assign(userUpdate.data, {
          singlesRating: singlesUpdate.rating,
          singlesRd: singlesUpdate.rd,
          singlesVolatility: singlesUpdate.volatility,
          singlesWins: {
            increment: result === 1 ? 1 : 0
          },
          singlesLosses: {
            increment: result === 0 ? 1 : 0
          },
          singlesLastMatchAt: timestamp
        });
      }

      if (match.matchType === MatchType.DOUBLES && team1DoublesState && team2DoublesState) {
        const opponentDoubles = isTeam1 ? team2DoublesState : team1DoublesState;
        const doublesUpdate = glicko2Update(buildModeState(user, 'doubles'), [
          {
            rating: opponentDoubles.rating,
            rd: opponentDoubles.rd,
            score: result
          }
        ]);

        Object.assign(userUpdate.data, {
          doublesRating: doublesUpdate.rating,
          doublesRd: doublesUpdate.rd,
          doublesVolatility: doublesUpdate.volatility,
          doublesWins: {
            increment: result === 1 ? 1 : 0
          },
          doublesLosses: {
            increment: result === 0 ? 1 : 0
          },
          doublesLastMatchAt: timestamp
        });
      }

      await tx.user.update(userUpdate);

      await tx.ratingHistory.create({
        data: {
          userId: user.id,
          matchId: match.id,
          rating: updateOverall.rating,
          rd: updateOverall.rd,
          volatility: updateOverall.volatility,
          deltaMu: updateOverall.deltaMu,
          deltaSigma: updateOverall.deltaSigma,
          playedAt: timestamp
        }
      });

      ratingSnapshots.push({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        outcome: result === 1 ? 'WIN' : 'LOSS',
        before: { rating: user.glickoRating, rd: user.glickoRd },
        after: { rating: updateOverall.rating, rd: updateOverall.rd }
      });
    }

    await tx.auditLog.create({
      data: {
        matchId: match.id,
        message: 'RATINGS_APPLIED',
        metadata: {
          matchId: match.id,
          playedAt: timestamp.toISOString(),
          matchType: match.matchType,
          team1Score: match.team1Score,
          team2Score: match.team2Score,
          participants: ratingSnapshots.map((snapshot) => ({
            userId: snapshot.userId,
            username: snapshot.username,
            displayName: snapshot.displayName,
            outcome: snapshot.outcome,
            before: snapshot.before,
            after: snapshot.after,
            delta: Number((snapshot.after.rating - snapshot.before.rating).toFixed(4)),
            rdChange: Number((snapshot.after.rd - snapshot.before.rd).toFixed(4))
          }))
        }
      }
    });
  });
}
