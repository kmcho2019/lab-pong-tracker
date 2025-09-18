"use client";

import { useMemo, useState } from 'react';
import { leagueDayjs, LEAGUE_TIMEZONE } from '@/utils/time';

interface RatingSparklineProps {
  history: Array<{ playedAt: Date | string | null; rating: number }>;
}

type ChartPoint = {
  x: number;
  y: number;
  rating: number;
  playedAt: string;
};

type ChartTicks = {
  x: Array<{ x: number; label: string }>;
  y: Array<{ y: number; label: string }>;
};

const dimensions = { width: 640, height: 220, padding: 48 } as const;

export function RatingSparkline({ history }: RatingSparklineProps) {
  const { points, ticks } = useMemo(() => buildChart(history), [history]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900"
        role="img"
        aria-label="Rating trajectory"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Grid and axes */}
        <line
          x1={dimensions.padding}
          x2={dimensions.padding}
          y1={dimensions.padding}
          y2={dimensions.height - dimensions.padding}
          stroke="#94a3b8"
          strokeWidth={1}
        />
        <line
          x1={dimensions.padding}
          x2={dimensions.width - dimensions.padding}
          y1={dimensions.height - dimensions.padding}
          y2={dimensions.height - dimensions.padding}
          stroke="#94a3b8"
          strokeWidth={1}
        />
        {ticks.y.map((tick) => (
          <g key={`y-${tick.label}`}>
            <line
              x1={dimensions.padding}
              x2={dimensions.width - dimensions.padding}
              y1={tick.y}
              y2={tick.y}
              stroke="#cbd5f5"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={dimensions.padding - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-slate-500 text-xs"
            >
              {tick.label}
            </text>
          </g>
        ))}
        {ticks.x.map((tick) => (
          <g key={`x-${tick.label}`}>
            <line
              x1={tick.x}
              x2={tick.x}
              y1={dimensions.padding}
              y2={dimensions.height - dimensions.padding}
              stroke="#cbd5f5"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={tick.x}
              y={dimensions.height - dimensions.padding + 20}
              textAnchor="middle"
              className="fill-slate-500 text-xs"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Line and points */}
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={2} />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={4}
            fill="#2563eb"
            className="cursor-pointer"
            onMouseEnter={() => setHoveredIndex(index)}
          />
        ))}
      </svg>

      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: `${(hoveredPoint.x / dimensions.width) * 100}%`,
            top: `${(hoveredPoint.y / dimensions.height) * 100}%`
          }}
        >
          <div className="font-semibold">{Math.round(hoveredPoint.rating)}</div>
          <div className="mt-1 text-[10px] text-slate-200">
            {leagueDayjs(hoveredPoint.playedAt).tz(LEAGUE_TIMEZONE).format('YYYY-MM-DD HH:mm')}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildChart(history: Array<{ playedAt: Date | string | null; rating: number }>): {
  points: ChartPoint[];
  ticks: ChartTicks;
} {
  const filtered = history
    .filter((entry) => entry.playedAt)
    .map((entry) => ({
      playedAt: leagueDayjs(entry.playedAt!).tz(LEAGUE_TIMEZONE),
      rating: entry.rating
    }))
    .sort((a, b) => a.playedAt.valueOf() - b.playedAt.valueOf());

  if (filtered.length === 0) {
    return { points: [], ticks: { x: [], y: [] } };
  }

  const times = filtered.map((entry) => entry.playedAt.valueOf());
  const [minDate, maxDate] = computeExtent(times);
  const ratings = filtered.map((entry) => entry.rating);
  const [minRatingRaw, maxRatingRaw] = computeExtent(ratings);

  if (minDate === null || maxDate === null || minRatingRaw === null || maxRatingRaw === null) {
    return { points: [], ticks: { x: [], y: [] } };
  }

  const dateRange = maxDate - minDate || 1;
  const ratingPadding = Math.max(10, (maxRatingRaw - minRatingRaw) * 0.1);
  const minRating = minRatingRaw - ratingPadding;
  const maxRating = maxRatingRaw + ratingPadding;
  const ratingRange = maxRating - minRating || 1;

  const points: ChartPoint[] = filtered.map((entry) => {
    const x =
      dimensions.padding +
      ((entry.playedAt.valueOf() - minDate) / dateRange) * (dimensions.width - dimensions.padding * 2);
    const y =
      dimensions.height -
      dimensions.padding -
      ((entry.rating - minRating) / ratingRange) * (dimensions.height - dimensions.padding * 2);
    return {
      x,
      y,
      rating: entry.rating,
      playedAt: entry.playedAt.toISOString()
    };
  });

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, index) => {
    const ratio = index / Math.max(yTickCount - 1, 1);
    const value = minRating + ratio * ratingRange;
    const y =
      dimensions.height -
      dimensions.padding -
      ratio * (dimensions.height - dimensions.padding * 2);
    return { y, label: Math.round(value).toString() };
  });

  const xTickCount = Math.min(5, filtered.length);
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    if (xTickCount === 1) {
      const x = dimensions.padding + (dimensions.width - dimensions.padding * 2) / 2;
      return {
        x,
        label: filtered[0].playedAt.tz(LEAGUE_TIMEZONE).format('MM-DD')
      };
    }
    const position = (index / (xTickCount - 1)) * dateRange + minDate;
    const x =
      dimensions.padding + ((position - minDate) / dateRange) * (dimensions.width - dimensions.padding * 2);
    const label = leagueDayjs(position).tz(LEAGUE_TIMEZONE).format('MM-DD');
    return { x, label };
  });

  return {
    points,
    ticks: { x: xTicks, y: yTicks }
  };
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
