import type { ThroughputPeriod } from "../../composables/useApiClient";

/** Mock 1c layout constants (viewBox 760×300). */
export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 300;
export const PLOT_LEFT = 48;
export const PLOT_RIGHT = 740;

export const COUNT_TOP = 20;
export const COUNT_BASELINE = 130;
export const POINTS_TOP = 170;
export const POINTS_BASELINE = 270;

const BAR_WIDTH = 30;

export interface ChartPoint {
  index: number;
  cx: number;
  count: number;
  points: number;
  barX: number;
  barY: number;
  barHeight: number;
  lineY: number;
  label: string;
  periodStart: string;
  periodEnd: string;
}

export interface AxisTicks {
  max: number;
  values: number[];
}

/**
 * Format periodStart ISO date as mock 1c x-axis label ("6/01").
 * Uses calendar date parts only (no timezone shift via Date).
 */
export function formatPeriodLabel(periodStart: string): string {
  const datePart = periodStart.slice(0, 10);
  const [, month = "01", day = "01"] = datePart.split("-");
  return `${Number(month)}/${day}`;
}

/** Round up to a tidy axis ceiling so ticks stay readable integers. */
export function niceCeiling(maxValue: number): number {
  if (maxValue <= 0) return 1;
  const padded = maxValue * 1.1;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return Math.ceil(nice * magnitude);
}

export function buildAxisTicks(maxValue: number): AxisTicks {
  const max = niceCeiling(maxValue);
  const mid = max / 2;
  const values =
    Number.isInteger(mid) || mid * 2 === max
      ? [0, mid, max]
      : [0, Math.round(mid), max];
  return { max, values: [...new Set(values)] };
}

function plotCenters(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(PLOT_LEFT + PLOT_RIGHT) / 2];
  const span = PLOT_RIGHT - PLOT_LEFT;
  const step = span / (count + 1);
  return Array.from({ length: count }, (_, i) => PLOT_LEFT + step * (i + 1));
}

function scaleY(value: number, max: number, top: number, baseline: number): number {
  if (max <= 0) return baseline;
  const ratio = Math.min(Math.max(value / max, 0), 1);
  return baseline - ratio * (baseline - top);
}

export function buildChartLayout(periods: ThroughputPeriod[]): {
  countAxis: AxisTicks;
  pointsAxis: AxisTicks;
  points: ChartPoint[];
  linePointsAttr: string;
  areaPointsAttr: string;
} {
  const countAxis = buildAxisTicks(Math.max(0, ...periods.map((p) => p.completedCount)));
  const pointsAxis = buildAxisTicks(Math.max(0, ...periods.map((p) => p.completedPoints)));
  const centers = plotCenters(periods.length);

  const points: ChartPoint[] = periods.map((period, index) => {
    const cx = centers[index] ?? (PLOT_LEFT + PLOT_RIGHT) / 2;
    const barHeight =
      countAxis.max <= 0
        ? 0
        : (period.completedCount / countAxis.max) * (COUNT_BASELINE - COUNT_TOP);
    const barY = COUNT_BASELINE - barHeight;
    const lineY = scaleY(period.completedPoints, pointsAxis.max, POINTS_TOP, POINTS_BASELINE);
    return {
      index,
      cx,
      count: period.completedCount,
      points: period.completedPoints,
      barX: cx - BAR_WIDTH / 2,
      barY,
      barHeight,
      lineY,
      label: formatPeriodLabel(period.periodStart),
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    };
  });

  const linePointsAttr = points.map((p) => `${p.cx},${p.lineY}`).join(" ");
  const areaPointsAttr =
    points.length === 0
      ? ""
      : [
          ...points.map((p) => `${p.cx},${p.lineY}`),
          `${points[points.length - 1]!.cx},${POINTS_BASELINE}`,
          `${points[0]!.cx},${POINTS_BASELINE}`,
        ].join(" ");

  return { countAxis, pointsAxis, points, linePointsAttr, areaPointsAttr };
}

export function countTickY(value: number, max: number): number {
  return scaleY(value, max, COUNT_TOP, COUNT_BASELINE);
}

export function pointsTickY(value: number, max: number): number {
  return scaleY(value, max, POINTS_TOP, POINTS_BASELINE);
}

export { BAR_WIDTH };
