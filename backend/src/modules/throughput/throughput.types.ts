// Throughput domain types (design.md "Backend/throughput" Service Interface).
export type PeriodType = "week" | "month";

export interface ThroughputPeriod {
  periodStart: Date;
  periodEnd: Date;
  completedCount: number;
  completedPoints: number;
}

export interface CaseOutlook {
  openTaskCount: number;
  openPoints: number;
  requiredPeriods: number | null;
  remainingPeriods: number | null;
  marginPoints: number | null;
}

export interface ThroughputSummary {
  periods: ThroughputPeriod[];
  forecastNextPeriodCount: number | null;
  forecastNextPeriodPoints: number | null;
  /** Present only when caseId was specified (Requirements 7.1–7.5). */
  caseOutlook?: CaseOutlook;
}
