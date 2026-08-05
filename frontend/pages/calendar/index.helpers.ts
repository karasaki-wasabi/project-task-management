// Pure derived-data logic for the calendar page (task 3.1, design.md
// "Components and Interfaces > Frontend/calendar > CalendarHelpers" Service
// Interface, Requirement 2.1, 2.2, 2.5, 4.1, 4.2, 4.3). Extracted from the
// (future) .vue SFC so it can be unit-tested without mounting a component
// (this repo has no @vue/test-utils / DOM test environment configured, see
// frontend/vitest.config.ts) — same pattern as
// frontend/pages/kanban/index.helpers.ts and
// frontend/components/shared/DatePicker.helpers.ts.
//
// `buildCaseSegments` (design.md's CalendarHelpers interface also declares
// this) is deliberately NOT implemented here — it belongs to a separate task
// (3.2) and is intentionally left out so this file's exports stay scoped to
// task 3.1's boundary.

// Map keys throughout this module are `YYYY-MM-DD` local-calendar-day
// strings, matching frontend/components/shared/DatePicker.helpers.ts's
// convention (see that file's header comment for why `Date#toISOString()`
// is avoided: it converts to UTC and can shift the calendar day).
export interface TaskMarkerView {
  taskId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
}

export interface DayVisibleMarkers {
  visible: TaskMarkerView[];
  overflowCount: number;
}

// `Task.scheduledDate` (frontend/composables/useApiClient.ts) is backed by a
// Prisma `@db.Date` column (backend/src/prisma/schema.prisma), which Fastify
// serializes as an ISO datetime string at UTC midnight of the stored
// calendar day (e.g. "2026-08-05T00:00:00.000Z"). Unlike
// DatePicker.helpers.ts's case (a client-side "today"/picker value that
// starts life as a local Date), there is no meaningful time-of-day component
// here to convert — the calendar day the backend intends is already exactly
// the string's date portion. Slicing it directly (rather than round-tripping
// through `new Date(...)` + local getters) avoids any timezone conversion
// entirely, so this is correct for every viewer's local timezone, not only
// timezones ahead of UTC.
function toLocalDateKey(scheduledDate: string): string {
  return scheduledDate.slice(0, 10);
}

// Requirement 2.1, 2.2: groups tasks that have a scheduledDate by date key;
// tasks without one (undefined or null) are excluded entirely so they never
// appear on the calendar.
export function buildTaskMarkersByDate(tasks: Task[]): Map<string, TaskMarkerView[]> {
  const markersByDate = new Map<string, TaskMarkerView[]>();

  for (const task of tasks) {
    if (!task.scheduledDate) {
      continue;
    }

    const marker: TaskMarkerView = {
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    };

    const dateKey = toLocalDateKey(task.scheduledDate);
    const existing = markersByDate.get(dateKey);
    if (existing) {
      existing.push(marker);
    } else {
      markersByDate.set(dateKey, [marker]);
    }
  }

  return markersByDate;
}

// Requirement 2.5: UI-density threshold for a single day cell. Chosen as a
// small number that keeps a day cell's height predictable in a month-grid
// layout (mirrors kanban's "+N名" overflow pattern for
// TeamWorkloadSummary — research.md "Light Discovery結果 5" — which also
// caps visible entries and folds the remainder into a "+N" count).
const MAX_VISIBLE_TASK_MARKERS_PER_DAY = 3;

// Requirement 2.5: returns the top N markers for a day plus how many were
// omitted, so the caller can render "+N件" once the day's marker count
// would otherwise overflow the cell.
export function truncateDayMarkers(markers: TaskMarkerView[]): DayVisibleMarkers {
  if (markers.length <= MAX_VISIBLE_TASK_MARKERS_PER_DAY) {
    return { visible: markers, overflowCount: 0 };
  }

  return {
    visible: markers.slice(0, MAX_VISIBLE_TASK_MARKERS_PER_DAY),
    overflowCount: markers.length - MAX_VISIBLE_TASK_MARKERS_PER_DAY,
  };
}

// Requirement 4.1, 4.2, 4.3: computes the year/month reached by shifting
// `delta` months from `year`/`month` (1-indexed, matching
// DatePicker.helpers.ts's `generateMonthGrid` convention). Handles
// arbitrary deltas (not just +/-1) and correctly rolls over year
// boundaries in both directions (December + 1 -> next January, January - 1
// -> previous December) via floor-division on the zero-indexed month
// rather than a hardcoded +/-1 special case.
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroIndexedMonth = month - 1 + delta;
  const yearOffset = Math.floor(zeroIndexedMonth / 12);
  const normalizedMonth = ((zeroIndexedMonth % 12) + 12) % 12;

  return {
    year: year + yearOffset,
    month: normalizedMonth + 1,
  };
}
