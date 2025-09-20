export interface ProfileMatchParticipant {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  teamNo: number | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
  rdBefore: number | null;
  rdAfter: number | null;
}

export interface ProfileMatch {
  id: string;
  matchType: 'SINGLES' | 'DOUBLES';
  team1Score: number;
  team2Score: number;
  playedAt: string;
  participants: ProfileMatchParticipant[];
}
