import { z } from 'zod';

export const scoreSchema = z.object({
  targetPoints: z.number().int().min(1).max(21).default(11),
  winByMargin: z.number().int().min(1).max(5).default(2),
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0)
});

export const matchPayloadSchema = z
  .object({
    matchType: z.enum(['SINGLES', 'DOUBLES']),
    seasonId: z.string().optional(),
    team1: z.array(z.string().cuid()).nonempty(),
    team2: z.array(z.string().cuid()).nonempty(),
    team1Score: z.number().int(),
    team2Score: z.number().int(),
    targetPoints: z.number().int().optional(),
    winByMargin: z.number().int().optional(),
    playedAt: z.string().datetime().optional(),
    location: z.string().max(120).optional(),
    note: z.string().max(280).optional()
  })
  .refine((payload) => payload.team1Score !== payload.team2Score, {
    message: 'Matches cannot end in a draw'
  })
  .refine((payload) => payload.team1.every((player) => !payload.team2.includes(player)), {
    message: 'Players cannot appear on both teams'
  })
  .superRefine((payload, ctx) => {
    const target = payload.targetPoints ?? 11;
    const winBy = payload.winByMargin ?? 2;
    const maxScore = Math.max(payload.team1Score, payload.team2Score);
    const minScore = Math.min(payload.team1Score, payload.team2Score);
    if (maxScore < target) {
      ctx.addIssue({ code: 'custom', message: 'Winner must reach the target score' });
    }
    if (maxScore - minScore < winBy) {
      ctx.addIssue({ code: 'custom', message: 'Winner must lead by the win-by margin' });
    }
    if (payload.matchType === 'SINGLES') {
      if (payload.team1.length !== 1 || payload.team2.length !== 1) {
        ctx.addIssue({ code: 'custom', message: 'Singles matches must have exactly one player per team' });
      }
    }
    if (payload.matchType === 'DOUBLES') {
      if (payload.team1.length !== 2 || payload.team2.length !== 2) {
        ctx.addIssue({ code: 'custom', message: 'Doubles matches must have exactly two players per team' });
      }
    }
  });

export type MatchPayload = z.infer<typeof matchPayloadSchema>;
