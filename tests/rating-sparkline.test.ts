import { describe, expect, it } from 'vitest';

import type { RatingHistoryPoint } from '@/types/rating-history';
import { buildChart } from '@/features/players/rating-sparkline';

describe('rating sparkline chart builder', () => {
  const sampleHistory: RatingHistoryPoint[] = [
    {
      playedAt: '2025-09-01T10:00:00Z',
      rating: 1500,
      rd: 60,
      matchId: 'm1',
      matchInfo: null,
      mode: 'overall'
    },
    {
      playedAt: '2025-09-03T11:30:00Z',
      rating: 1510,
      rd: 55,
      matchId: 'm2',
      matchInfo: null,
      mode: 'overall'
    },
    {
      playedAt: '2025-09-05T09:15:00Z',
      rating: 1495,
      rd: 62,
      matchId: 'm3',
      matchInfo: null,
      mode: 'overall'
    }
  ];

  it('creates chronological points and ticks when axis mode is time', () => {
    const chart = buildChart(sampleHistory, 'time');
    expect(chart.points).toHaveLength(3);
    expect(chart.points[0].matchIndex).toBe(1);
    expect(chart.points[1].matchIndex).toBe(2);
    expect(chart.points[0].rating).toBe(1500);
    expect(chart.points[0].ciTopValue).toBeCloseTo(1500 + 120);
    expect(chart.points[2].ciBottomValue).toBeCloseTo(1495 - 124);
    expect(chart.ticks.x.length).toBeGreaterThan(0);
    expect(chart.ticks.x[0].label).toMatch(/\d{2}-\d{2}/);
    expect(chart.confidenceAreaPath).toBeTruthy();
  });

  it('uses match indices for x-axis ticks when axis mode is index', () => {
    const chart = buildChart(sampleHistory, 'index');
    expect(chart.points[0].matchIndex).toBe(1);
    expect(chart.points[0].rd).toBe(60);
    expect(chart.points[0].x).toBeLessThan(chart.points[2].x);
    expect(chart.ticks.x[0].label).toBe('#1');
    expect(chart.ticks.x[chart.ticks.x.length - 1].label).toBe(`#${sampleHistory.length}`);
    expect(chart.confidenceAreaPath).toContain('Z');
  });
});
