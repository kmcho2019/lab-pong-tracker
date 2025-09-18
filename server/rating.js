import { sortBy } from './util.js';

const BASE_RATING = 1500;
const K_FACTOR = 24;

function getExpectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function ensureHistory(stats) {
  if (stats.ratingHistory.length === 0) {
    stats.ratingHistory.push({
      matchId: null,
      playedAt: null,
      rating: BASE_RATING,
      delta: 0
    });
  }
}

export function computeLeague(players, matches) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const stats = new Map();

  for (const player of players) {
    stats.set(player.id, {
      id: player.id,
      displayName: player.displayName,
      username: player.username,
      handedness: player.handedness ?? null,
      joinedAt: player.joinedAt ?? null,
      rating: BASE_RATING,
      wins: 0,
      losses: 0,
      streak: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      lastPlayedAt: null,
      ratingHistory: [],
      headToHead: new Map(),
      recentMatches: []
    });
  }

  const enrichedMatches = [];
  const orderedMatches = [...matches].sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());

  for (const match of orderedMatches) {
    const playerOne = stats.get(match.playerOneId);
    const playerTwo = stats.get(match.playerTwoId);

    if (!playerOne || !playerTwo) {
      continue; // Skip matches referring to unknown players
    }

    ensureHistory(playerOne);
    ensureHistory(playerTwo);

    const playedAtIso = new Date(match.playedAt).toISOString();
    const playerOneScore = Number(match.playerOneScore ?? 0);
    const playerTwoScore = Number(match.playerTwoScore ?? 0);

    let outcome;
    if (playerOneScore > playerTwoScore) {
      outcome = { winner: playerOne, loser: playerTwo, winnerScore: playerOneScore, loserScore: playerTwoScore };
    } else if (playerTwoScore > playerOneScore) {
      outcome = { winner: playerTwo, loser: playerOne, winnerScore: playerTwoScore, loserScore: playerOneScore };
    } else {
      continue; // ignore draws for now
    }

    const playerOneExpected = getExpectedScore(playerOne.rating, playerTwo.rating);
    const playerTwoExpected = 1 - playerOneExpected;

    const playerOneScoreResult = playerOne === outcome.winner ? 1 : 0;
    const playerTwoScoreResult = 1 - playerOneScoreResult;

    const playerOneRatingBefore = playerOne.rating;
    const playerTwoRatingBefore = playerTwo.rating;

    const deltaOne = K_FACTOR * (playerOneScoreResult - playerOneExpected);
    const deltaTwo = K_FACTOR * (playerTwoScoreResult - playerTwoExpected);

    playerOne.rating = Math.round((playerOne.rating + deltaOne) * 10) / 10;
    playerTwo.rating = Math.round((playerTwo.rating + deltaTwo) * 10) / 10;

    const winner = outcome.winner;
    const loser = outcome.loser;

    winner.wins += 1;
    winner.matchesPlayed += 1;
    winner.streak = winner.streak >= 0 ? winner.streak + 1 : 1;
    winner.longestWinStreak = Math.max(winner.longestWinStreak, winner.streak);

    loser.losses += 1;
    loser.matchesPlayed += 1;
    loser.streak = loser.streak <= 0 ? loser.streak - 1 : -1;
    loser.longestLossStreak = Math.min(loser.longestLossStreak, loser.streak);

    playerOne.pointsFor += playerOneScore;
    playerOne.pointsAgainst += playerTwoScore;
    playerTwo.pointsFor += playerTwoScore;
    playerTwo.pointsAgainst += playerOneScore;

    playerOne.lastPlayedAt = playedAtIso;
    playerTwo.lastPlayedAt = playedAtIso;

    const roundedDeltaOne = Math.round(deltaOne * 100) / 100;
    const roundedDeltaTwo = Math.round(deltaTwo * 100) / 100;

    playerOne.ratingHistory.push({
      matchId: match.id,
      playedAt: playedAtIso,
      rating: playerOne.rating,
      delta: roundedDeltaOne
    });
    playerTwo.ratingHistory.push({
      matchId: match.id,
      playedAt: playedAtIso,
      rating: playerTwo.rating,
      delta: roundedDeltaTwo
    });

    winner.recentMatches.push(match.id);
    loser.recentMatches.push(match.id);

    // Head to head updates
    updateHeadToHead(winner, loser, playedAtIso, true);
    updateHeadToHead(loser, winner, playedAtIso, false);

    enrichedMatches.push({
      id: match.id,
      playedAt: playedAtIso,
      playerOne: {
        id: match.playerOneId,
        displayName: playersById.get(match.playerOneId)?.displayName ?? 'Unknown',
        score: playerOneScore,
        ratingBefore: playerOneRatingBefore,
        ratingAfter: playerOne.rating,
        delta: roundedDeltaOne
      },
      playerTwo: {
        id: match.playerTwoId,
        displayName: playersById.get(match.playerTwoId)?.displayName ?? 'Unknown',
        score: playerTwoScore,
        ratingBefore: playerTwoRatingBefore,
        ratingAfter: playerTwo.rating,
        delta: roundedDeltaTwo
      },
      winnerId: winner.id,
      loserId: loser.id,
      notes: match.notes ?? null,
      location: match.location ?? null,
      submittedBy: match.submittedBy ?? null,
      target: match.target ?? 11,
      winBy: match.winBy ?? 2
    });
  }

  const collator = new Intl.Collator(['ko', 'en'], { sensitivity: 'base' });

  const playersWithDerived = Array.from(stats.values()).map((playerStat) => {
    const losses = playerStat.losses;
    const total = playerStat.matchesPlayed;
    const winPct = total ? Math.round((playerStat.wins / total) * 1000) / 10 : 0;
    const pointDifferential = playerStat.pointsFor - playerStat.pointsAgainst;

    const headToHead = Array.from(playerStat.headToHead.entries())
      .map(([opponentId, record]) => ({
        opponentId,
        wins: record.wins,
        losses: record.losses,
        lastPlayedAt: record.lastPlayedAt,
        opponentName: playersById.get(opponentId)?.displayName ?? 'Unknown'
      }))
      .sort((a, b) => collator.compare(a.opponentName, b.opponentName));

    return {
      ...playerStat,
      winPct,
      pointDifferential,
      recentMatches: playerStat.recentMatches.slice(-10),
      ratingHistory: playerStat.ratingHistory,
      headToHead
    };
  });

  const rankings = playersWithDerived
    .slice()
    .sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return collator.compare(a.displayName, b.displayName);
    });

  const matchesSorted = enrichedMatches
    .slice()
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

  return {
    players: playersWithDerived,
    rankings,
    matches: matchesSorted
  };
}

function updateHeadToHead(subject, opponent, playedAt, didWin) {
  const existing = subject.headToHead.get(opponent.id) ?? { wins: 0, losses: 0, lastPlayedAt: null };
  if (didWin) {
    existing.wins += 1;
  } else {
    existing.losses += 1;
  }
  existing.lastPlayedAt = playedAt;
  subject.headToHead.set(opponent.id, existing);
}
