import type { NonBusinessDay } from "../../../../composables/useApiClient";

export type HolidaySourceTone = "neutral" | "info";

export interface HolidaySourceBadge {
  tone: HolidaySourceTone;
  label: string;
}

export function holidaySourceBadge(source: NonBusinessDay["source"]): HolidaySourceBadge {
  if (source === "external_api") {
    return { tone: "info", label: "外部API" };
  }
  return { tone: "neutral", label: "手動" };
}

export function formatSyncResult(addedCount: number, skippedExisting: number): string {
  return `新規追加: ${addedCount}件 / スキップ: ${skippedExisting}件`;
}

export function sortHolidaysByDate(holidays: NonBusinessDay[]): NonBusinessDay[] {
  return holidays.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function holidayDisplayLabel(label: string | undefined): string {
  return label && label.trim().length > 0 ? label : "—";
}
