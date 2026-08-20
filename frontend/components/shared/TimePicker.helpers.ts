export type Period = "AM" | "PM";

export interface TimeParts {
  hour24: number; // 0-23
  minute: number; // 0-59
}

export interface TwelveHourParts {
  hour12: number; // 1-12
  minute: number; // 0-59
  period: Period;
}

export function parseHHmm(value: string): TimeParts | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour24, minute };
}

export function formatHHmm(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function to12Hour(hour24: number, minute: number): TwelveHourParts {
  const period: Period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

export function to24Hour(hour12: number, minute: number, period: Period): TimeParts {
  const base = hour12 % 12; // 12 -> 0, 1-11 unchanged
  const hour24 = period === "AM" ? base : base + 12;
  return { hour24, minute };
}

export function formatDisplay12(hour24: number, minute: number): string {
  const { hour12, period } = to12Hour(hour24, minute);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function computeNowHHmm(now: Date): string {
  return formatHHmm(now.getHours(), now.getMinutes());
}

export function wrapHour12(hour12: number, delta: number): number {
  // Shift to a 0-11 range to use plain modulo, then shift back to 1-12.
  const zeroBased = ((hour12 - 1 + delta) % 12 + 12) % 12;
  return zeroBased + 1;
}

export function wrapMinute(minute: number, delta: number): number {
  return ((minute + delta) % 60 + 60) % 60;
}

export function togglePeriod(period: Period): Period {
  return period === "AM" ? "PM" : "AM";
}
