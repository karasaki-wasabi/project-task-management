// ThroughputService (design.md "Backend/throughput", Requirements 3.1–3.6, 4.1–4.3, 7.1–7.5).
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { caseReadService } from "../cases/case-read.service.js";
import { taskIntegrityService } from "../tasks/task-integrity.service.js";
import type { CaseOutlook, PeriodType, ThroughputPeriod, ThroughputSummary } from "./throughput.types.js";

const FORECAST_WINDOW = 4;
const MIN_PERIODS_FOR_FORECAST = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function periodLengthDays(periodType: PeriodType): number {
  return periodType === "week" ? 7 : 30;
}

function computeRemainingPeriods(endDate: Date, now: Date, periodType: PeriodType): number {
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysRemaining = Math.max(0, (endDate.getTime() - todayMidnight.getTime()) / MS_PER_DAY);
  return daysRemaining / periodLengthDays(periodType);
}

async function buildCaseOutlook(
  workspaceId: VerifiedWorkspaceId,
  caseId: string,
  periodType: PeriodType,
  forecastNextPeriodPoints: number | null,
  now: Date,
): Promise<CaseOutlook> {
  const caseEntity = await caseReadService.findInWorkspace(caseId, workspaceId);
  if (!caseEntity) {
    throw badRequest("caseId does not exist in the current workspace");
  }

  const { count: openTaskCount, points: openPoints } = await taskIntegrityService.countOpenTasksWithPoints(
    workspaceId,
    caseId,
  );

  let remainingPeriods: number | null = null;
  let requiredPeriods: number | null = null;
  let marginPoints: number | null = null;

  if (caseEntity.endDate != null) {
    remainingPeriods = computeRemainingPeriods(caseEntity.endDate, now, periodType);
    // Forecast must be calculable AND > 0 (0 would divide-by-zero / "算出不可").
    if (forecastNextPeriodPoints != null && forecastNextPeriodPoints > 0) {
      requiredPeriods = Math.ceil(openPoints / forecastNextPeriodPoints);
      marginPoints = forecastNextPeriodPoints * remainingPeriods - openPoints;
    }
  }

  return {
    openTaskCount,
    openPoints,
    requiredPeriods,
    remainingPeriods,
    marginPoints,
  };
}

export const throughputService = {
  async getSummary(
    periodType: PeriodType,
    rangeCount: number,
    workspaceId: VerifiedWorkspaceId,
    caseId?: string,
    now: Date = new Date(),
  ): Promise<ThroughputSummary> {
    if (!Number.isInteger(rangeCount) || rangeCount < 1) {
      throw badRequest("rangeCount must be a positive integer");
    }

    const boundaries = buildPeriodBoundaries(periodType, rangeCount, now);
    const periods: ThroughputPeriod[] = await Promise.all(
      boundaries.map(async ({ start, end }) => {
        const { count, points } = await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
          start,
          end,
          workspaceId,
          caseId,
        );
        return {
          periodStart: start,
          periodEnd: end,
          completedCount: count,
          completedPoints: points,
        };
      }),
    );

    let forecastNextPeriodCount: number | null = null;
    let forecastNextPeriodPoints: number | null = null;
    if (periods.length >= MIN_PERIODS_FOR_FORECAST) {
      const window = periods.slice(-FORECAST_WINDOW);
      const countSum = window.reduce((total, p) => total + p.completedCount, 0);
      const pointsSum = window.reduce((total, p) => total + p.completedPoints, 0);
      forecastNextPeriodCount = Math.round(countSum / window.length);
      forecastNextPeriodPoints = Math.round(pointsSum / window.length);
    }

    const summary: ThroughputSummary = { periods, forecastNextPeriodCount, forecastNextPeriodPoints };

    if (caseId !== undefined) {
      summary.caseOutlook = await buildCaseOutlook(
        workspaceId,
        caseId,
        periodType,
        forecastNextPeriodPoints,
        now,
      );
    }

    return summary;
  },
};
