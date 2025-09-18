'use client';

import { useMemo } from 'react';

interface RatingSparklineProps {
  history: Array<{ playedAt: Date | string | null; rating: number }>;
}

export function RatingSparkline({ history }: RatingSparklineProps) {
  const dimensions = { width: 640, height: 200, padding: 28 };

  const points = useMemo(() => {
    const filtered = history.filter((entry) => entry.playedAt);
    if (filtered.length === 0) return [] as Array<{ x: number; y: number }>;

    const [minDate, maxDate] = computeExtent(filtered.map((entry) => new Date(entry.playedAt!).getTime()));
    const [minRating, maxRating] = computeExtent(filtered.map((entry) => entry.rating));
    if (minDate === null || maxDate === null || minRating === null || maxRating === null) {
      return [] as Array<{ x: number; y: number }>;
    }

    const rangeDate = maxDate - minDate || 1;
    const rangeRating = maxRating - minRating || 1;

    return filtered.map((entry) => {
      const x = dimensions.padding + ((new Date(entry.playedAt!).getTime() - minDate) / rangeDate) * (dimensions.width - dimensions.padding * 2);
      const y =
        dimensions.height -
        dimensions.padding -
        ((entry.rating - minRating) / rangeRating) * (dimensions.height - dimensions.padding * 2);
      return { x, y };
    });
  }, [history, dimensions.height, dimensions.padding, dimensions.width]);

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-600">
        Rating history will appear after the first confirmed match.
      </div>
    );
  }

  const pathD = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="w-full rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={2} />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={3} fill="#2563eb" />
      ))}
    </svg>
  );
}

function computeExtent(values: number[]): [number | null, number | null] {
  if (!values.length) return [null, null];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}
