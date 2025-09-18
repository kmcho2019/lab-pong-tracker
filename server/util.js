export function sortBy(collection, iteratees) {
  const list = Array.isArray(collection) ? collection.slice() : [];
  if (!Array.isArray(iteratees) || iteratees.length === 0) {
    return list;
  }

  return list.sort((a, b) => {
    for (const iteratee of iteratees) {
      const aValue = iteratee(a);
      const bValue = iteratee(b);

      if (aValue === bValue) continue;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return aValue - bValue;
      }

      return aValue > bValue ? 1 : -1;
    }
    return 0;
  });
}

export function slugify(name) {
  if (!name) return '';
  const base = name
    .normalize('NFKD')
    .replace(/[^\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\w\s-]+/gu, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
  return base.toLowerCase();
}

export function isValidScore(a, b, target = 11, winBy = 2) {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (max < target) return false;
  if (max - min < winBy) return false;
  return true;
}
