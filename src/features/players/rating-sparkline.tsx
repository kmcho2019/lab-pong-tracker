"use client";

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { leagueDayjs, LEAGUE_TIMEZONE } from '@/utils/time';
import type { RatingHistoryPoint } from '@/types/rating-history';

interface RatingSparklineProps {
  history: RatingHistoryPoint[];
}

export type AxisMode = 'time' | 'index';

type ChartPoint = {
  x: number;
  y: number;
  rating: number;
  rd: number;
  ciTopValue: number;
  ciBottomValue: number;
  ciTopY: number;
  ciBottomY: number;
  matchIndex: number;
  playedAt: string;
  matchInfo: RatingHistoryPoint['matchInfo'];
};

type ChartTicks = {
  x: Array<{ x: number; label: string }>;
  y: Array<{ y: number; label: string }>;
};

export type ChartBuildResult = {
  points: ChartPoint[];
  ticks: ChartTicks;
  confidenceAreaPath: string | null;
  trendSlope: number;
  trendLinePath: string | null;
};

const dimensions = { width: 640, height: 220, padding: 48 } as const;

export function RatingSparkline({ history }: RatingSparklineProps) {
  const [axisMode, setAxisMode] = useState<AxisMode>('time');
  const { points, ticks, confidenceAreaPath, trendSlope, trendLinePath } = useMemo(
    () => buildChart(history, axisMode),
    [history, axisMode]
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const trend: 'up' | 'down' | 'flat' = trendSlope > 1 ? 'up' : trendSlope < -1 ? 'down' : 'flat';

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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">X-axis</span>
          <button
            type="button"
            onClick={() => setAxisMode('time')}
            className={clsx(
              'rounded-full px-3 py-1 font-semibold transition',
              axisMode === 'time'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
            )}
          >
            Date
          </button>
          <button
            type="button"
            onClick={() => setAxisMode('index')}
            className={clsx(
              'rounded-full px-3 py-1 font-semibold transition',
              axisMode === 'index'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
            )}
          >
            Match #
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold uppercase tracking-wide',
              trend === 'up'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                : trend === 'down'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
            )}
          >
            {trend === 'up' ? 'Trend ↑' : trend === 'down' ? 'Trend ↓' : 'Trend ↔'}
          </span>
          <SparklineLegend trend={trend} />
        </div>
      </div>
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
        {ticks.x.map((tick, index) => (
          <g key={`x-${axisMode}-${index}`}>
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

        {/* Confidence interval area */}
        {confidenceAreaPath ? <path d={confidenceAreaPath} fill="#2563eb" opacity={0.12} /> : null}

        {/* Trend line */}
        {trendLinePath ? (
          <path d={trendLinePath} fill="none" stroke="#f97316" strokeWidth={2} strokeDasharray="6 4" opacity={0.7} />
        ) : null}

        {/* Line and points */}
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={2} />
        {points.map((point, index) => (
          <g key={index}>
            <line
              x1={point.x}
              x2={point.x}
              y1={point.ciTopY}
              y2={point.ciBottomY}
              stroke="#2563eb"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.6}
            />
            <line
              x1={point.x - 4}
              x2={point.x + 4}
              y1={point.ciTopY}
              y2={point.ciTopY}
              stroke="#2563eb"
              strokeWidth={1}
              opacity={0.6}
            />
            <line
              x1={point.x - 4}
              x2={point.x + 4}
              y1={point.ciBottomY}
              y2={point.ciBottomY}
              stroke="#2563eb"
              strokeWidth={1}
              opacity={0.6}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={4}
              fill="#2563eb"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIndex(index)}
            />
          </g>
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
            {axisMode === 'index'
              ? `Match #${hoveredPoint.matchIndex}`
              : leagueDayjs(hoveredPoint.playedAt).tz(LEAGUE_TIMEZONE).format('YYYY-MM-DD HH:mm')}
          </div>
          {axisMode === 'index' ? (
            <div className="text-[10px] text-slate-400">
              {leagueDayjs(hoveredPoint.playedAt).tz(LEAGUE_TIMEZONE).format('YYYY-MM-DD HH:mm')}
            </div>
          ) : null}
          <div className="mt-1 text-[10px] text-slate-200">± {Math.round(hoveredPoint.rd * 2)} (RD)</div>
          <div className="text-[10px] text-slate-200">
            Range {Math.round(hoveredPoint.ciBottomValue)} – {Math.round(hoveredPoint.ciTopValue)}
          </div>
          {hoveredPoint.matchInfo ? (
            <>
              <div className="mt-1 text-[10px] text-slate-200">
                {hoveredPoint.matchInfo.result} vs{' '}
                {hoveredPoint.matchInfo.opponents.length > 0
                  ? hoveredPoint.matchInfo.opponents.join(' / ')
                  : 'Unknown opponent'}
              </div>
              <div className="text-[10px] text-slate-200">
                Score {hoveredPoint.matchInfo.score} ·
                {hoveredPoint.matchInfo.matchType === 'SINGLES' ? ' Singles' : ' Doubles'}
              </div>
              {hoveredPoint.matchInfo.teammates.length > 0 ? (
                <div className="text-[10px] text-slate-400">
                  With {hoveredPoint.matchInfo.teammates.join(' / ')}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function buildChart(history: RatingHistoryPoint[], axisMode: AxisMode): ChartBuildResult {
  const filtered = history
    .filter((entry) => entry.playedAt)
    .map((entry) => ({
      playedAt: leagueDayjs(entry.playedAt!).tz(LEAGUE_TIMEZONE),
      rating: entry.rating,
      rd: entry.rd,
      matchInfo: entry.matchInfo
    }))
    .sort((a, b) => a.playedAt.valueOf() - b.playedAt.valueOf());

  if (filtered.length === 0) {
    return { points: [], ticks: { x: [], y: [] }, confidenceAreaPath: null, trendSlope: 0, trendLinePath: null };
  }

  const indexed = filtered.map((entry, idx) => ({ ...entry, matchIndex: idx + 1 }));

  const bounds = indexed.reduce(
    (acc, entry) => {
      const ciTop = entry.rating + entry.rd * 2;
      const ciBottom = entry.rating - entry.rd * 2;
      return {
        min: Math.min(acc.min, ciBottom, entry.rating),
        max: Math.max(acc.max, ciTop, entry.rating)
      };
    },
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
  );

  const ratingPadding = Math.max(10, (bounds.max - bounds.min) * 0.1);
  const minRating = bounds.min - ratingPadding;
  const maxRating = bounds.max + ratingPadding;
  const ratingRange = maxRating - minRating || 1;

  const availableWidth = dimensions.width - dimensions.padding * 2;
  const availableHeight = dimensions.height - dimensions.padding * 2;

  const points: ChartPoint[] = [];
  let xTicks: ChartTicks['x'] = [];

  if (axisMode === 'index') {
    const denominator = Math.max(indexed.length - 1, 1);
    const computeX = (position: number) =>
      indexed.length === 1
        ? dimensions.padding + availableWidth / 2
        : dimensions.padding + (position / denominator) * availableWidth;

    indexed.forEach((entry, idx) => {
      const x = computeX(idx);
      const ciTopValue = entry.rating + entry.rd * 2;
      const ciBottomValue = entry.rating - entry.rd * 2;
      const ciTopY =
        dimensions.height -
        dimensions.padding -
        ((ciTopValue - minRating) / ratingRange) * availableHeight;
      const ciBottomY =
        dimensions.height -
        dimensions.padding -
        ((ciBottomValue - minRating) / ratingRange) * availableHeight;

      points.push({
        x,
        y:
          dimensions.height -
          dimensions.padding -
          ((entry.rating - minRating) / ratingRange) * availableHeight,
        rating: entry.rating,
        rd: entry.rd,
        ciTopValue,
        ciBottomValue,
        ciTopY,
        ciBottomY,
        matchIndex: entry.matchIndex,
        playedAt: entry.playedAt.toISOString(),
        matchInfo: entry.matchInfo
      });
    });

    const tickCount = Math.min(5, indexed.length);
    const seen = new Set<number>();
    const ticks: ChartTicks['x'] = [];
    for (let tick = 0; tick < tickCount; tick += 1) {
      const ratio = tickCount === 1 ? 0 : tick / (tickCount - 1);
      const indexValue = Math.round(ratio * (indexed.length - 1));
      if (seen.has(indexValue)) continue;
      seen.add(indexValue);
      ticks.push({
        x: computeX(indexValue),
        label: `#${indexed[indexValue].matchIndex}`
      });
    }
    xTicks = ticks;
  } else {
    const times = indexed.map((entry) => entry.playedAt.valueOf());
    const [minDate, maxDate] = computeExtent(times);
    const dateRange = maxDate !== null && minDate !== null ? maxDate - minDate || 1 : 1;

    const computeX = (timestamp: number) =>
      minDate === null
        ? dimensions.padding + availableWidth / 2
        : dimensions.padding + ((timestamp - minDate) / dateRange) * availableWidth;

    indexed.forEach((entry) => {
      const ciTopValue = entry.rating + entry.rd * 2;
      const ciBottomValue = entry.rating - entry.rd * 2;
      const ciTopY =
        dimensions.height -
        dimensions.padding -
        ((ciTopValue - minRating) / ratingRange) * availableHeight;
      const ciBottomY =
        dimensions.height -
        dimensions.padding -
        ((ciBottomValue - minRating) / ratingRange) * availableHeight;

      points.push({
        x: computeX(entry.playedAt.valueOf()),
        y:
          dimensions.height -
          dimensions.padding -
          ((entry.rating - minRating) / ratingRange) * availableHeight,
        rating: entry.rating,
        rd: entry.rd,
        ciTopValue,
        ciBottomValue,
        ciTopY,
        ciBottomY,
        matchIndex: entry.matchIndex,
        playedAt: entry.playedAt.toISOString(),
        matchInfo: entry.matchInfo
      });
    });

    const tickCount = Math.min(5, indexed.length);
    const ticks: ChartTicks['x'] = [];
    for (let tick = 0; tick < tickCount; tick += 1) {
      if (tickCount === 1) {
        ticks.push({
          x: dimensions.padding + availableWidth / 2,
          label: indexed[0].playedAt.tz(LEAGUE_TIMEZONE).format('MM-DD')
        });
        break;
      }
      const ratio = tick / (tickCount - 1);
      const position =
        minDate === null
          ? indexed[0].playedAt.valueOf()
          : ratio * (dateRange) + minDate;
      ticks.push({
        x: computeX(position),
        label: leagueDayjs(position).tz(LEAGUE_TIMEZONE).format('MM-DD')
      });
    }
    xTicks = ticks;
  }

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, index) => {
    const ratio = index / Math.max(yTickCount - 1, 1);
    const value = minRating + ratio * ratingRange;
    const y =
      dimensions.height -
      dimensions.padding -
      ratio * availableHeight;
    return { y, label: Math.round(value).toString() };
  });

  const trendSlope = computeTrend(points);
  const trendLinePath = buildTrendLine(points);

  return {
    points,
    ticks: { x: xTicks, y: yTicks },
    confidenceAreaPath: buildConfidenceAreaPath(points),
    trendSlope,
    trendLinePath
  };
}

function computeTrend(points: ChartPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  return last.rating - first.rating;
}

function buildTrendLine(points: ChartPoint[]): string | null {
  if (points.length < 2) return null;
  const n = points.length;
  const meanX = points.reduce((acc, point) => acc + point.x, 0) / n;
  const meanY = points.reduce((acc, point) => acc + point.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    numerator += dx * (point.y - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const startY = slope * startPoint.x + intercept;
  const endY = slope * endPoint.x + intercept;
  return `M ${startPoint.x.toFixed(2)} ${startY.toFixed(2)} L ${endPoint.x.toFixed(2)} ${endY.toFixed(2)}`;
}

function buildConfidenceAreaPath(points: ChartPoint[]): string | null {
  if (!points.length) return null;
  if (points.length === 1) {
    const point = points[0];
    const halfWidth = 6;
    const left = point.x - halfWidth;
    const right = point.x + halfWidth;
    return `M ${left.toFixed(2)} ${point.ciTopY.toFixed(2)} L ${right.toFixed(2)} ${point.ciTopY.toFixed(2)} L ${right.toFixed(2)} ${point.ciBottomY.toFixed(2)} L ${left.toFixed(2)} ${point.ciBottomY.toFixed(2)} Z`;
  }

  const upperPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.ciTopY.toFixed(2)}`)
    .join(' ');
  const lowerPath = [...points]
    .reverse()
    .map((point) => `L ${point.x.toFixed(2)} ${point.ciBottomY.toFixed(2)}`)
    .join(' ');
  return `${upperPath} ${lowerPath} Z`;
}

function SparklineLegend({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-300">
      <span className="flex items-center gap-1">
        <span className="inline-block h-1.5 w-4 rounded-full bg-[#2563eb]" aria-hidden />
        Rating
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1.5 w-4 rounded-full border border-dashed border-[#2563eb]" aria-hidden />
        ±2 RD
      </span>
      <span className="flex items-center gap-1">
        <span
          className={clsx(
            'inline-block h-1.5 w-4 rounded-full border border-dashed',
            trend === 'up'
              ? 'border-emerald-500'
              : trend === 'down'
              ? 'border-rose-500'
              : 'border-slate-400'
          )}
          aria-hidden
        />
        Trend
      </span>
    </div>
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
