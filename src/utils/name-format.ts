export interface NamedEntity {
  displayName: string;
}

export function findDuplicateDisplayNames<T extends NamedEntity>(items: T[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = item.displayName.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const duplicates = new Set<string>();
  counts.forEach((count, key) => {
    if (count > 1) duplicates.add(key);
  });
  return duplicates;
}

export function formatDisplayLabel(displayName: string, username: string, duplicates: Set<string>) {
  const key = displayName.trim().toLowerCase();
  if (duplicates.has(key)) {
    return `${displayName} (@${username})`;
  }
  return displayName;
}
