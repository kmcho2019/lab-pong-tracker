import { describe, expect, it } from 'vitest';
import { formatDate, toLeagueIso, LEAGUE_TIMEZONE, leagueDayjs } from '@/utils/time';

describe('time utilities', () => {
  it('converts local KST input into UTC ISO string', () => {
    const iso = toLeagueIso('2025-09-18T20:30');
    expect(iso).toBe('2025-09-18T11:30:00.000Z');
  });

  it('formats ISO timestamps in league timezone', () => {
    const formatted = formatDate('2025-09-18T11:30:00.000Z');
    expect(formatted).toBe('2025-09-18 20:30');
  });

  it('provides leagueDayjs helper locked to the league timezone', () => {
    const zoned = leagueDayjs('2025-09-18T11:30:00.000Z').tz(LEAGUE_TIMEZONE);
    expect(zoned.format('YYYY-MM-DD HH:mm')).toBe('2025-09-18 20:30');
  });
});
