// Throughput domain types (task 7.1, design.md "Backend/throughput" Service
// Interface).
export type PeriodType = "week" | "month";

export interface ThroughputPeriod {
  periodStart: Date;
  periodEnd: Date;
  completedCount: number;
}

export interface ThroughputSummary {
  periods: ThroughputPeriod[];
  forecastNextPeriodCount: number | null;
}
