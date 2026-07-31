// ThroughputService (task 7.1, design.md "Backend/throughput", Requirements
// 6.1-6.4, 9.5).
import { badRequest } from "../../shared/http-errors.js";
import { throughputRepository } from "./throughput.repository.js";
import type { PeriodType, ThroughputPeriod, ThroughputSummary } from "./throughput.types.js";

const FORECAST_WINDOW = 4;
const MIN_PERIODS_FOR_FORECAST = 2;

// design.md Implementation Notes: "期間境界(週開始曜日等)はUTC基準の月曜始
// まりで固定する". Both helpers return the start of the period CONTAINING
// `date` (i.e. today's in-progress period, not a past one).
function startOfCurrentWeekUTC(date: Date): Date {
  const midnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (midnight.getUTCDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  midnight.setUTCDate(midnight.getUTCDate() - daysSinceMonday);
  return midnight;
}

function startOfCurrentMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftPeriod(start: Date, periodType: PeriodType, delta: number): Date {
  const shifted = new Date(start);
  if (periodType === "week") {
    shifted.setUTCDate(shifted.getUTCDate() + delta * 7);
  } else {
    shifted.setUTCMonth(shifted.getUTCMonth() + delta);
  }
  return shifted;
}

// Builds `rangeCount` fully-elapsed periods, oldest first, ending at the
// period immediately before the one containing `now` — the in-progress
// current period is never included (Requirements 6.2, 6.3: both are framed
// around "過去" / past pace).
function buildPeriodBoundaries(periodType: PeriodType, rangeCount: number, now: Date): Array<{ start: Date; end: Date }> {
  const currentPeriodStart = periodType === "week" ? startOfCurrentWeekUTC(now) : startOfCurrentMonthUTC(now);
  const boundaries: Array<{ start: Date; end: Date }> = [];
  for (let i = rangeCount; i >= 1; i -= 1) {
    const start = shiftPeriod(currentPeriodStart, periodType, -i);
    const nextStart = shiftPeriod(start, periodType, 1);
    boundaries.push({ start, end: new Date(nextStart.getTime() - 1) });
  }
  return boundaries;
}

export const throughputService = {
  async getSummary(periodType: PeriodType, rangeCount: number, now: Date = new Date()): Promise<ThroughputSummary> {
    if (!Number.isInteger(rangeCount) || rangeCount < 1) {
      throw badRequest("rangeCount must be a positive integer");
    }

    const boundaries = buildPeriodBoundaries(periodType, rangeCount, now);
    const periods: ThroughputPeriod[] = await Promise.all(
      boundaries.map(async ({ start, end }) => ({
        periodStart: start,
        periodEnd: end,
        completedCount: await throughputRepository.countCompleted(start, end),
      })),
    );

    let forecastNextPeriodCount: number | null = null;
    if (periods.length >= MIN_PERIODS_FOR_FORECAST) {
      const window = periods.slice(-FORECAST_WINDOW);
      const sum = window.reduce((total, p) => total + p.completedCount, 0);
      forecastNextPeriodCount = Math.round(sum / window.length);
    }

    return { periods, forecastNextPeriodCount };
  },
};
