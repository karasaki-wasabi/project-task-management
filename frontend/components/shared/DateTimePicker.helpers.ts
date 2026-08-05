// Pure date+time combine/split logic for shared/DateTimePicker.vue (task
// 12.2, design.md "Frontend / shared > TimePicker / DateTimePicker(適用先画
// 面なし)": "`v-model`型は`string`(ISO 8601日時、空文字は未設定)。内部実装は
// `DatePicker`/`TimePicker`のロジックを流用し、二重実装を避ける").
//
// This module intentionally contains NO calendar-grid or wheel math of its
// own — that logic already exists in ./DatePicker.helpers.ts and
// ./TimePicker.helpers.ts and is imported as-is by DateTimePicker.vue. The
// only genuinely new logic needed for the combined picker is joining a
// date-only ISO string (`YYYY-MM-DD`, DatePicker's wire format) and a
// time-only string (`HH:mm`, TimePicker's wire format) into a single ISO
// 8601 datetime string, and splitting one back into its two parts.
//
// Combined wire format: `YYYY-MM-DDTHH:mm` (no seconds, no timezone offset)
// — matches the task's example (`2026-09-14T13:30`) and this app's existing
// "empty string = unset" convention (no `Date`/`null` at the v-model
// boundary).

export interface DateTimeParts {
  dateOnly: string; // `YYYY-MM-DD`, or "" if not part of the combined value
  hhmm: string; // `HH:mm`, or "" if not part of the combined value
}

// Joins a date-only ISO string and an HH:mm time string into a single ISO
// 8601 datetime string. Either part being empty ("unset", per both
// DatePicker's and TimePicker's own v-model conventions) means there is no
// well-formed combined value yet, so this returns "" rather than a
// half-populated string — mirrors DatePicker/TimePicker themselves never
// emitting a partial value.
export function combineDateTime(dateOnly: string, hhmm: string): string {
  if (!dateOnly || !hhmm) return "";
  return `${dateOnly}T${hhmm}`;
}

// Splits a combined ISO 8601 datetime string back into its date-only and
// HH:mm parts. Inverse of combineDateTime. The empty (unset) string splits
// into two empty parts; any string without a "T" separator is treated as
// having no valid time part (defensive — combineDateTime never produces
// such a string, but callers may seed this from external/legacy data).
export function splitDateTime(value: string): DateTimeParts {
  if (!value) return { dateOnly: "", hhmm: "" };
  const separatorIndex = value.indexOf("T");
  if (separatorIndex === -1) return { dateOnly: value, hhmm: "" };
  return {
    dateOnly: value.slice(0, separatorIndex),
    hhmm: value.slice(separatorIndex + 1),
  };
}
