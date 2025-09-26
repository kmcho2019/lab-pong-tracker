export type RatingResult = 'Win' | 'Loss';

export interface RatingHistoryMatchInfo {
  id: string;
  score: string;
  result: RatingResult;
  matchType: 'SINGLES' | 'DOUBLES';
  opponents: string[];
  teammates: string[];
}

export interface RatingHistoryPoint {
  playedAt: Date | string | null;
  rating: number;
  rd: number;
  matchId?: string | null;
  matchInfo: RatingHistoryMatchInfo | null;
}
