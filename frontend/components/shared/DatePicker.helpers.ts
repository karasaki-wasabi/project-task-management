// Pure date-math logic for shared/DatePicker.vue (task 11.1, design.md
// "Frontend / shared(新規) > DatePicker" Implementation Notes, Requirement
// 10.2). Extracted from the .vue SFC so calendar grid generation and
// quick-select date arithmetic can be unit-tested without mounting a
// component (this repo has no @vue/test-utils / DOM test environment
// configured, see frontend/vitest.config.ts) — same pattern as
// frontend/pages/kanban/index.helpers.ts.
//
// All dates in/out of this module are local-calendar-day ISO strings
// (`YYYY-MM-DD`), matching the `Case.startDate`/`endDate` /
// `DatePicker.vue`'s `v-model` convention (frontend/composables/useApiClient.ts).
// Deliberately NOT using `Date#toISOString()` (backend's
// `holidays/holiday.repository.ts` `formatDateOnly` convention) because that
// converts to UTC, which would shift the calendar day whenever the browser's
// local timezone offset is non-zero relative to UTC (this is a client-side
// picker driven by the user's local "today", so local-calendar semantics are
// what a Japanese-locale user expects, e.g. midnight JST must read as
// "today", not "yesterday" in UTC).

export interface DateCell {
  date: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dayOfWeek: number; // 0 (Sun) .. 6 (Sat) — for weekend-color styling
}

// Kanji weekday labels/colors as specified in the claude design mockup's
// `support.js` (Component.weekdays/cells: Sun "#c05a5a" / Sat "#5a7fc0").
// Kept here (not re-derived per-call-site) so DatePicker.vue's header row
// and calendar cells can't drift out of sync with each other.
export const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function weekdayKanji(dayOfWeek: number): string {
  return WEEKDAY_KANJI[dayOfWeek] ?? "";
}

// Display-only `YYYY/MM/DD` formatting (claude design mockup format, e.g.
// "2026/09/14") — the wire/v-model format stays `YYYY-MM-DD` (see module
// header), this is purely a presentation transform for the trigger label
// and popover header.
export function formatSlashDate(dateOnly: string): string {
  return toDateOnlyIso(dateOnly).replaceAll("-", "/");
}

// Prisma `@db.Date` is serialized by Fastify as UTC midnight ISO
// (`2026-08-10T00:00:00.000Z`). DatePicker's wire format is the calendar-day
// prefix `YYYY-MM-DD`. Slicing avoids `new Date(...)` timezone shifts.
export function toDateOnlyIso(value: string): string {
  return value.slice(0, 10);
}

// Formats a Date's local calendar day as `YYYY-MM-DD`. Local getters
// (getFullYear/getMonth/getDate), not toISOString(), so the result reflects
// the date as it appears on the user's local calendar (see module comment).
function formatLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Parses a `YYYY-MM-DD` string into a local-midnight Date. Pairs with
// formatLocalDateOnly (round-trips through local calendar semantics, not
// UTC), so `parseLocalDateOnly(formatLocalDateOnly(d))` always yields the
// same calendar day regardless of timezone.
function parseLocalDateOnly(dateOnly: string): Date {
  const parts = toDateOnlyIso(dateOnly).split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
}

// Requirement 10.2: quick-select date calculation. Originally computed
// 今日/明日/1週間後/月末/来月1日, but the user reported (after using the
// implemented picker) that the extra four chips went unused and asked to
// keep only 今日 — trimmed here rather than left as unreferenced dead code.
// `now` is injected (not `new Date()`) so callers/tests get deterministic
// results; only the calendar-day portion of `now` is used, so callers may
// pass e.g. the current instant unchanged.
export function computeTodayIso(now: Date): string {
  return formatLocalDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

// Requirement 10.2: month calendar grid generation.
//
// `month` is 1-indexed (1 = January .. 12 = December) — matches how a
// calendar UI's "year/month" header is naturally read/written, unlike JS
// Date's native 0-indexed month.
//
// Week start: Sunday-Saturday. Decision: this codebase has no existing
// calendar-week precedent to follow, so Sunday-start was chosen as the more
// common default for a general-purpose date picker (also JS Date's own
// `getDay()` convention: 0=Sunday), over a Monday-start ISO week.
//
// The grid always contains complete weeks (a multiple of 7 cells), padded
// with the trailing days of the previous month and the leading days of the
// next month so every row is a full Sun-Sat week — a template can `v-for`
// over the flat array and `slice`/`chunk` it into rows of 7 as needed.
export function generateMonthGrid(
  year: number,
  month: number,
  todayIso: string,
  selectedIso: string,
): DateCell[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);

  const leadingDays = firstOfMonth.getDay(); // 0 (Sun) .. 6 (Sat)
  const trailingDays = 6 - lastOfMonth.getDay();

  const gridStart = new Date(year, month - 1, 1 - leadingDays);
  const totalCells = leadingDays + lastOfMonth.getDate() + trailingDays;

  const cells: DateCell[] = [];
  for (let offset = 0; offset < totalCells; offset += 1) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
    const dateIso = formatLocalDateOnly(cellDate);
    cells.push({
      date: dateIso,
      inCurrentMonth: cellDate.getMonth() === month - 1 && cellDate.getFullYear() === year,
      isToday: dateIso === todayIso,
      isSelected: selectedIso !== "" && dateIso === selectedIso,
      dayOfWeek: cellDate.getDay(),
    });
  }

  return cells;
}

// Exposed for DatePicker.vue / future callers that need to round-trip a
// `YYYY-MM-DD` string (e.g. deriving the initial grid's year/month from a
// v-model value).
export { formatLocalDateOnly, parseLocalDateOnly };
