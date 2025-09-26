export const GLICKO_SCALE = 173.7178;
const DEFAULT_TAU = 0.5;
const DEFAULT_MAX_RD = 350;

export interface RatingState {
  rating: number;
  rd: number;
  volatility: number;
}

export interface OpponentState {
  rating: number;
  rd: number;
  score: number; // 1 win, 0 loss, 0.5 draw (unused for pong)
}

export interface RatingUpdate extends RatingState {
  deltaMu: number;
  deltaSigma: number;
}

function toMu(rating: number) {
  return (rating - 1500) / GLICKO_SCALE;
}

function toPhi(rd: number) {
  return rd / GLICKO_SCALE;
}

function fromMu(mu: number) {
  return mu * GLICKO_SCALE + 1500;
}

function fromPhi(phi: number) {
  return Math.min(phi * GLICKO_SCALE, DEFAULT_MAX_RD);
}

function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2);
}

function E(mu: number, muJ: number, phiJ: number) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export function glicko2Update(
  player: RatingState,
  opponents: OpponentState[],
  options?: { tau?: number; maxRd?: number }
): RatingUpdate {
  const tau = options?.tau ?? DEFAULT_TAU;
  const maxRd = options?.maxRd ?? DEFAULT_MAX_RD;

  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.volatility;

  if (opponents.length === 0) {
    const phiStar = Math.sqrt(phi ** 2 + sigma ** 2);
    return {
      rating: fromMu(mu),
      rd: Math.min(fromPhi(phiStar), maxRd),
      volatility: sigma,
      deltaMu: 0,
      deltaSigma: 0
    };
  }

  const opponentViews = opponents.map((opp) => ({
    mu: toMu(opp.rating),
    phi: toPhi(opp.rd),
    score: opp.score
  }));

  const vDenominator = opponentViews.reduce((acc, opp) => {
    const gPhi = g(opp.phi);
    const EValue = E(mu, opp.mu, opp.phi);
    return acc + gPhi ** 2 * EValue * (1 - EValue);
  }, 0);

  const v = 1 / vDenominator;

  const delta = v * opponentViews.reduce((acc, opp) => {
    const gPhi = g(opp.phi);
    const EValue = E(mu, opp.mu, opp.phi);
    return acc + gPhi * (opp.score - EValue);
  }, 0);

  const a = Math.log(sigma ** 2);

  const f = (x: number) => {
    const expX = Math.exp(x);
    const numerator = expX * (delta ** 2 - phi ** 2 - v - expX);
    const denominator = 2 * (phi ** 2 + v + expX) ** 2;
    return numerator / denominator - (x - a) / (tau ** 2);
  };

  let A = a;
  let B: number;
  if (delta ** 2 > phi ** 2 + v) {
    B = Math.log(delta ** 2 - phi ** 2 - v);
  } else {
    let k = 1;
    B = a - k * tau;
    while (f(B) < 0) {
      k += 1;
      B = a - k * tau;
    }
  }

  let fA = f(A);
  let fB = f(B);

  while (Math.abs(B - A) > 1e-6) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const sigmaPrime = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi ** 2 + sigmaPrime ** 2);
  const phiPrime = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / v);

  const muPrime = mu + phiPrime ** 2 * opponentViews.reduce((acc, opp) => {
    const gPhi = g(opp.phi);
    const EValue = E(mu, opp.mu, opp.phi);
    return acc + gPhi * (opp.score - EValue);
  }, 0);

  return {
    rating: fromMu(muPrime),
    rd: Math.min(fromPhi(phiPrime), maxRd),
    volatility: sigmaPrime,
    deltaMu: muPrime - mu,
    deltaSigma: sigmaPrime - sigma
  };
}

export function combineTeam(players: RatingState[]): RatingState {
  if (players.length === 0) {
    throw new Error('Team must include at least one player');
  }

  const muValues = players.map((player) => toMu(player.rating));
  const phiValues = players.map((player) => toPhi(player.rd));
  const muAvg = muValues.reduce((acc, value) => acc + value, 0) / muValues.length;
  const varianceMean =
    phiValues.reduce((acc, phiValue) => acc + phiValue ** 2, 0) / phiValues.length;
  const phiTeam = Math.sqrt(varianceMean) / (players.length > 1 ? 2 : 1);

  const rating = fromMu(muAvg);
  const rd = fromPhi(phiTeam);
  const volatility = players.reduce((acc, player) => acc + player.volatility, 0) / players.length;

  return {
    rating,
    rd,
    volatility
  };
}

export function inflateRd(player: RatingState, periods = 1, maxRd = DEFAULT_MAX_RD): RatingState {
  const phi = toPhi(player.rd);
  const sigma = player.volatility;
  const inflatedPhi = Math.sqrt(phi ** 2 + sigma ** 2 * periods);
  return {
    rating: player.rating,
    rd: Math.min(fromPhi(inflatedPhi), maxRd),
    volatility: player.volatility
  };
}
