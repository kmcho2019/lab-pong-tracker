import { describe, expect, it } from 'vitest';
import { findDuplicateDisplayNames, formatDisplayLabel } from '@/utils/name-format';

describe('findDuplicateDisplayNames', () => {
  it('identifies duplicate display names ignoring case and spacing', () => {
    const duplicates = findDuplicateDisplayNames([
      { displayName: 'Alex Kim' },
      { displayName: 'alex kim ' },
      { displayName: 'Jamie Lee' }
    ]);

    expect(duplicates.has('alex kim')).toBe(true);
    expect(duplicates.has('jamie lee')).toBe(false);
  });
});

describe('formatDisplayLabel', () => {
  it('appends username when display name is duplicated', () => {
    const duplicates = new Set(['alex kim']);
    expect(formatDisplayLabel('Alex Kim', 'alex', duplicates)).toBe('Alex Kim (@alex)');
  });

  it('returns display name alone when unique', () => {
    const duplicates = new Set<string>();
    expect(formatDisplayLabel('Jamie Lee', 'jamie', duplicates)).toBe('Jamie Lee');
  });
});
