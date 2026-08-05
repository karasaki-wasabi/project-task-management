// Pure time-math logic for shared/TimePicker.vue (task 12.1, design.md
// "Frontend / shared > TimePicker / DateTimePicker(適用先画面なし)"
// Implementation Notes: "操作ロジックの純関数部分の単体テストのみで検証" — this
// component has no consuming screen in this spec, so (per the design's own
// risk note) the pure logic is what gets real test coverage; the .vue SFC
// itself is exercised only by hand/browser per the task's "観測可能な完了状態".
//
// Extracted from the SFC for the same reason as DatePicker.helpers.ts: this
// repo has no @vue/test-utils / DOM test environment configured (see
// frontend/vitest.config.ts), so anything worth unit-testing has to be a
// plain function.
//
// `v-model` convention (design.md, task 12.1): `HH:mm` 24-hour string,
// empty string = unset. The wheel UI itself is 12-hour + AM/PM (per claude
// design 4c), so this module also owns the 12h<->24h conversion at the
// boundary between the wire format and the picker's internal draft state.

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

// Parses an `HH:mm` string into 24-hour parts. Returns null for the "unset"
// empty string or any malformed input, so callers can fall back to a
// default (e.g. "now") without this module deciding what that default is.
export function parseHHmm(value: string): TimeParts | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour24, minute };
}

// Formats 24-hour parts as a zero-padded `HH:mm` string (the v-model wire
// format).
export function formatHHmm(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Converts 24-hour parts to the wheel UI's 12-hour + AM/PM representation.
// 0:00 -> 12 AM, 12:00 -> 12 PM (standard 12-hour clock convention).
export function to12Hour(hour24: number, minute: number): TwelveHourParts {
  const period: Period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

// Converts the wheel UI's 12-hour + AM/PM representation back to 24-hour
// parts (the inverse of to12Hour).
export function to24Hour(hour12: number, minute: number, period: Period): TimeParts {
  const base = hour12 % 12; // 12 -> 0, 1-11 unchanged
  const hour24 = period === "AM" ? base : base + 12;
  return { hour24, minute };
}

// Formats 24-hour parts as a 12-hour display string matching the wheel's own
// representation (e.g. "10:00 AM") — used for both the trigger button label
// and the popover's draft header, so the two never disagree about what
// "10:00 AM" means internally.
export function formatDisplay12(hour24: number, minute: number): string {
  const { hour12, period } = to12Hour(hour24, minute);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Reference-date-injected "now", truncated to HH:mm — same
// inject-the-clock-instead-of-`new Date()` pattern as
// DatePicker.helpers.computeQuickSelectDates, for deterministic tests.
export function computeNowHHmm(now: Date): string {
  return formatHHmm(now.getHours(), now.getMinutes());
}

// Circular ("infinite scroll") step for the hour wheel: 1-12 wraps both
// ways (12 + 1 -> 1, 1 - 1 -> 12). `delta` is typically +-1 per wheel
// tick/click, but any integer works.
export function wrapHour12(hour12: number, delta: number): number {
  // Shift to a 0-11 range to use plain modulo, then shift back to 1-12.
  const zeroBased = ((hour12 - 1 + delta) % 12 + 12) % 12;
  return zeroBased + 1;
}

// Circular step for the minute wheel: 0-59 wraps both ways (59 + 1 -> 0,
// 0 - 1 -> 59).
export function wrapMinute(minute: number, delta: number): number {
  return ((minute + delta) % 60 + 60) % 60;
}

// Toggles AM/PM (used by the AM/PM column, which per design.md is a
// 2-value toggle rather than a scrolling wheel).
export function togglePeriod(period: Period): Period {
  return period === "AM" ? "PM" : "AM";
}
