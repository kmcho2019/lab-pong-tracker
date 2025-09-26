export type RatingResult = 'Win' | 'Loss';

export type RatingHistoryMode = 'overall' | 'singles' | 'doubles';

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
  mode: RatingHistoryMode;
  matchId?: string | null;
  matchInfo: RatingHistoryMatchInfo | null;
}
