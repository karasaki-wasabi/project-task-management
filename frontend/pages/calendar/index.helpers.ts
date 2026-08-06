// Pure derived-data logic for the calendar page (task 7.2, design.md
// "Components and Interfaces > Frontend/calendar > CalendarHelpers" Service
// Interface, Requirement 2.1-2.6, 3.1-3.6, 4.1-4.3). Extracted from the
// .vue SFC so it can be unit-tested without mounting a component (this repo
// has no @vue/test-utils / DOM test environment configured, see
// frontend/vitest.config.ts) — same pattern as
// frontend/pages/kanban/index.helpers.ts and
// frontend/components/shared/DatePicker.helpers.ts.
//
// This module supersedes task 3.1/3.2's simpler per-day-cell segment
// approach: research.md "ビジュアルデザイン確定" (claude design) settled on
// a week-based greedy interval-scheduling lane assignment for case period
// bars instead, so `buildCaseSegments` (position: point/start/middle/end/
// single) has been replaced by `buildWeekCaseLanes` + `computeWeekRowBudget`
// below.
//
// A runtime (non-type-only) import is needed here for `parseLocalDateOnly`,
// so this uses a relative path rather than the `~/` alias: this repo's bare
// `vitest.config.ts` (frontend/vitest.config.ts) has no `~/` alias
// resolution configured (only Nuxt itself provides that at build/dev time),
// so every other `~/`-aliased import in this codebase's `.helpers.ts` files
// is `import type` only (erased entirely by TS, never actually resolved at
// runtime) — see e.g. frontend/pages/kanban/index.helpers.ts. A relative
// import works in both the Nuxt app and this Vitest suite.
import { parseLocalDateOnly, type DateCell } from "../../components/shared/DatePicker.helpers";

// Map keys throughout this module are `YYYY-MM-DD` local-calendar-day
// strings, matching frontend/components/shared/DatePicker.helpers.ts's
// convention (see that file's header comment for why `Date#toISOString()`
// is avoided: it converts to UTC and can shift the calendar day).
export interface TaskMarkerView {
  taskId: string;
  title: string;
  stage: string | null; // resolved developmentStageId -> DevelopmentStage.name
  isOverdue: boolean; // scheduledDate < 本日 かつ status !== "done"
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
// timezones ahead of UTC. Also used for `Case.startDate`/`endDate`, which
// share the same `@db.Date` serialization.
function toLocalDateKey(dateOnly: string): string {
  return dateOnly.slice(0, 10);
}

// Requirement 2.1, 2.2, 2.3, 2.4: groups tasks that have a scheduledDate by
// date key; tasks without one (undefined or null) are excluded entirely so
// they never appear on the calendar.
//
// Deviation from design.md's literal Service Interface text (flagged for
// reviewer attention, see status report CONCERNS): design.md's
// `buildTaskMarkersByDate(tasks: Task[])` signature doesn't specify how a
// `developmentStageId` is resolved to the `stage: string | null` label the
// new `TaskMarkerView` requires. `Task` only carries the id, not a resolved
// name (frontend/composables/useApiClient.ts), so this function takes an
// additional `stages` parameter and resolves the id via a `find`, the same
// lookup pattern as kanban/index.vue's `stageName()` helper. A `todayIso`
// parameter is added for the same reason: `isOverdue` needs "today", and
// this must stay a pure function (no `new Date()` inside), matching how
// frontend/pages/calendar/index.vue already computes `todayIso` once via
// `computeTodayIso` and threads it into `generateMonthGrid`.
export function buildTaskMarkersByDate(
  tasks: Task[],
  stages: DevelopmentStage[],
  todayIso: string,
): Map<string, TaskMarkerView[]> {
  const markersByDate = new Map<string, TaskMarkerView[]>();

  for (const task of tasks) {
    if (!task.scheduledDate) {
      continue;
    }

    const dateKey = toLocalDateKey(task.scheduledDate);

    // Requirement 2.3: developmentStageId unset -> null; set but not found
    // in the provided list falls back to the raw id (same forgiving
    // fallback as kanban/index.vue's `stageName(stageId) { ... ?? stageId }`)
    // rather than silently dropping the badge.
    const stage = task.developmentStageId
      ? (stages.find((s) => s.id === task.developmentStageId)?.name ?? task.developmentStageId)
      : null;

    // Requirement 2.4: date-only string comparison is safe here because
    // both sides are `YYYY-MM-DD` (lexicographic order matches calendar
    // order for this fixed-width format).
    const isOverdue = dateKey < todayIso && task.status !== "done";

    const marker: TaskMarkerView = { taskId: task.id, title: task.title, stage, isOverdue };

    const existing = markersByDate.get(dateKey);
    if (existing) {
      existing.push(marker);
    } else {
      markersByDate.set(dateKey, [marker]);
    }
  }

  return markersByDate;
}

// Requirement 2.5, 2.6: returns the top markers for a day plus how many were
// omitted, so the caller can render "他N件" once the day's marker count would
// otherwise overflow the cell. `maxVisible` is the total row budget for that
// day (from `computeWeekRowBudget`); the "他N件" chip itself consumes one of
// those rows, so when overflowing we show at most `maxVisible - 1` markers
// (e.g. budget 7 with 8 tasks → 6 visible + "他2件", not 7 + "他1件").
// `maxVisible` used to be a module-internal constant (task 3.1); claude
// design's "週7行固定" logic (research.md) makes the per-day task budget
// vary week to week, so the caller now supplies it per call.
export function truncateDayMarkers(markers: TaskMarkerView[], maxVisible: number): DayVisibleMarkers {
  if (markers.length <= maxVisible) {
    return { visible: markers, overflowCount: 0 };
  }

  // Reserve one row for the "他N件" chip so visible + chip never exceed maxVisible.
  const visibleCount = Math.max(0, maxVisible - 1);
  return {
    visible: markers.slice(0, visibleCount),
    overflowCount: markers.length - visibleCount,
  };
}

// Display caps for overflow chip labels. The reserved chip width is sized
// for the capped forms ("他99+件" / "他9+件") so large counts never reflow.
export const TASK_OVERFLOW_DISPLAY_CAP = 99;
export const CASE_OVERFLOW_DISPLAY_CAP = 9;

// Requirement 2.5: task day-cell overflow label. Uses the same 「他N件」
// wording as case overflow (not 「+N件」) so the longest form is 「他99+件」.
export function formatTaskOverflowLabel(overflowCount: number): string {
  const n = overflowCount > TASK_OVERFLOW_DISPLAY_CAP ? `${TASK_OVERFLOW_DISPLAY_CAP}+` : String(overflowCount);
  return `他${n}件`;
}

// Requirement 3.6: week case-band overflow label. Cap at 9 so the chip can
// reserve a stable width for 「他9+件」.
export function formatCaseOverflowLabel(overflowCount: number): string {
  const n = overflowCount > CASE_OVERFLOW_DISPLAY_CAP ? `${CASE_OVERFLOW_DISPLAY_CAP}+` : String(overflowCount);
  return `他${n}件`;
}

// Requirement 3.6 / tasks.md 7.6: the weekly "他N件" popup lists every case
// that intersects the week (lane items + overflow), not only the omitted
// ones — matching research.md "その週の全案件を一覧表示". Lane order is
// preserved, then overflow items follow.
export function collectWeekCasePopupItems(weekLanes: WeekCaseLanes, cases: Case[]): CaseOverflowItem[] {
  const byId = new Map(cases.map((caseItem) => [caseItem.id, caseItem]));
  const items: CaseOverflowItem[] = [];

  for (const laneItem of weekLanes.lanes.flat()) {
    const caseItem = byId.get(laneItem.caseId);
    const startKey = caseItem?.startDate ? toLocalDateKey(caseItem.startDate) : null;
    const endKey = caseItem?.endDate ? toLocalDateKey(caseItem.endDate) : null;
    items.push({
      caseId: laneItem.caseId,
      name: laneItem.name,
      rangeLabel: formatRangeLabel(startKey, endKey),
    });
  }

  for (const overflowItem of weekLanes.overflow) {
    items.push(overflowItem);
  }

  return items;
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

// Requirement 3.5, claude design ("案件の配色", research.md "ビジュアルデザ
// イン確定"): deterministic string hash of caseId mod 6, so the same case
// always renders in the same one of the 6-color palette regardless of call
// order or which week/month it's being rendered in. A simple multiplicative
// (base-31) hash is enough here — this only needs to be stable and roughly
// well-distributed across 6 buckets, not cryptographically strong.
export function colorIndexForCase(caseId: string): number {
  let hash = 0;
  for (let i = 0; i < caseId.length; i += 1) {
    hash = (hash * 31 + caseId.charCodeAt(i)) | 0; // |0 keeps this a 32-bit int
  }
  // hash may be negative (32-bit signed); normalize into [0, 6) without
  // relying on Math.abs (which mishandles Number.MIN_SAFE_INTEGER-adjacent
  // edge cases for |0-truncated hashes at -2^31).
  return ((hash % 6) + 6) % 6;
}

export interface CaseLaneItem {
  caseId: string;
  name: string;
  isCompleted: boolean;
  colorIndex: number; // 0-5, same value as colorIndexForCase(caseId)
  startDayIndex: number; // week-local column (0=Sun .. 6=Sat)
  endDayIndex: number;
  openStart: boolean; // range continues before the week's left edge (or startDate is unset)
  openEnd: boolean; // range continues past the week's right edge (or endDate is unset)
}

export interface CaseOverflowItem {
  caseId: string;
  name: string;
  rangeLabel: string; // display string, e.g. "8/17 〜 9/4"
}

export interface WeekCaseLanes {
  lanes: CaseLaneItem[][]; // at most maxLanes lanes; each lane's items never overlap
  overflow: CaseOverflowItem[]; // items that didn't fit within maxLanes
}

export interface WeekRowBudget {
  bandRows: number; // rows given to the case lane band (incl. the overflow chip row), 0..maxLanes
  maxTasks: number; // totalRows - bandRows
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

// claude design's overflow-chip popup label (research.md "ビジュアルデザイ
// ン確定", design.md CaseOverflowItem.rangeLabel example "8/17 〜 9/4").
// Uses the case's true (unclipped) start/end, not the week-clipped day
// indices, so the popup always shows the case's real range.
function formatRangeLabel(startKey: string | null, endKey: string | null): string {
  if (startKey !== null && endKey !== null) {
    return `${formatMonthDay(startKey)} 〜 ${formatMonthDay(endKey)}`;
  }
  if (startKey !== null) {
    return `${formatMonthDay(startKey)} 〜`;
  }
  if (endKey !== null) {
    return `〜 ${formatMonthDay(endKey)}`;
  }
  return "";
}

function diffDays(startKey: string, endKey: string): number {
  const start = parseLocalDateOnly(startKey);
  const end = parseLocalDateOnly(endKey);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

interface CaseLaneCandidate {
  caseId: string;
  name: string;
  isCompleted: boolean;
  startKey: string | null; // true (unclipped) case dates, for sorting/rangeLabel
  endKey: string | null;
  startDayIndex: number; // week-clipped column
  endDayIndex: number;
  openStart: boolean;
  openEnd: boolean;
}

// design.md Implementation Notes: "案件を「開始日・終了日どちらか未定のもの
// を優先」→「期間が長い順」→「開始日が早い順」でソートする". Open-ended
// cases (missing either side) are treated as effectively infinite duration
// so the primary/secondary criteria collapse into one comparison.
function compareCandidates(a: CaseLaneCandidate, b: CaseLaneCandidate): number {
  const aOpenEnded = a.startKey === null || a.endKey === null;
  const bOpenEnded = b.startKey === null || b.endKey === null;
  if (aOpenEnded !== bOpenEnded) {
    return aOpenEnded ? -1 : 1;
  }

  const aDuration = aOpenEnded ? Number.POSITIVE_INFINITY : diffDays(a.startKey!, a.endKey!);
  const bDuration = bOpenEnded ? Number.POSITIVE_INFINITY : diffDays(b.startKey!, b.endKey!);
  if (aDuration !== bDuration) {
    return bDuration - aDuration; // descending
  }

  const aSortStart = a.startKey ?? a.endKey ?? "";
  const bSortStart = b.startKey ?? b.endKey ?? "";
  if (aSortStart < bSortStart) return -1;
  if (aSortStart > bSortStart) return 1;
  return 0;
}

// Requirement 3.1-3.6, design.md Implementation Notes: greedy interval-
// scheduling lane assignment for a single week's case period bars
// (claude design's "週単位レーン割り当て", research.md "ビジュアルデザイン
// 確定"). `weekDays` must be a 7-element slice of `generateMonthGrid`'s
// result (design.md Preconditions).
//
// - Cases missing both startDate and endDate are excluded entirely
//   (Requirement 3.3).
// - Cases whose date range doesn't overlap this week at all are excluded
//   from this week's result (they'll appear in whichever week(s) they do
//   overlap).
// - A case with only one of startDate/endDate set occupies just that one
//   date, with the unset side always flagged `open` (Requirement 3.2,
//   design.md CaseLaneItem comments: "開始日未定、または月表示範囲外から
//   継続"). A case whose range extends past this week's boundary on either
//   side gets that side clipped to the week's edge (column 0 or 6) with the
//   corresponding `open*` flag set true (Requirement 3.4).
// - Cases are sorted (see compareCandidates) then greedily placed into the
//   first lane whose existing items don't overlap it; if none exists and
//   `lanes.length < maxLanes`, a new lane opens; otherwise the case goes to
//   `overflow` (Requirement 3.6) — this guarantees `lanes.length <=
//   maxLanes` and no item is dropped.
export function buildWeekCaseLanes(weekDays: DateCell[], cases: Case[], maxLanes: number): WeekCaseLanes {
  const weekStart = weekDays[0]?.date ?? "";
  const weekEnd = weekDays[weekDays.length - 1]?.date ?? "";

  const candidates: CaseLaneCandidate[] = [];

  for (const caseItem of cases) {
    const startKey = caseItem.startDate ? toLocalDateKey(caseItem.startDate) : null;
    const endKey = caseItem.endDate ? toLocalDateKey(caseItem.endDate) : null;

    if (startKey === null && endKey === null) {
      continue; // Requirement 3.3
    }

    const overlapsWeek = (startKey === null || startKey <= weekEnd) && (endKey === null || endKey >= weekStart);
    if (!overlapsWeek) {
      continue;
    }

    const openStart = startKey === null || startKey < weekStart;
    const openEnd = endKey === null || endKey > weekEnd;

    const startDayIndex = openStart ? 0 : weekDays.findIndex((cell) => cell.date === startKey);
    const endDayIndex = openEnd ? weekDays.length - 1 : weekDays.findIndex((cell) => cell.date === endKey);

    candidates.push({
      caseId: caseItem.id,
      name: caseItem.name,
      isCompleted: caseItem.isCompleted,
      startKey,
      endKey,
      startDayIndex,
      endDayIndex,
      openStart,
      openEnd,
    });
  }

  candidates.sort(compareCandidates);

  // First pass: try to place everything into `maxLanes` bar lanes. If any
  // case overflows, the "他N件" chip needs its own band row (research.md
  // `bandRows = min(lanes + dropped, maxLanes)`), so bar lanes must shrink
  // to `maxLanes - 1` — otherwise the chip shares the last lane and paints
  // over a bar (e.g. 4 overlapping cases → 2 bars + 他2件, not 3 bars with
  // an overlapping chip).
  const firstPass = placeCandidatesIntoLanes(candidates, maxLanes);
  if (firstPass.overflow.length === 0 || maxLanes <= 0) {
    return firstPass;
  }

  return placeCandidatesIntoLanes(candidates, Math.max(0, maxLanes - 1));
}

function placeCandidatesIntoLanes(candidates: CaseLaneCandidate[], laneCap: number): WeekCaseLanes {
  const lanes: CaseLaneItem[][] = [];
  const overflow: CaseOverflowItem[] = [];

  for (const candidate of candidates) {
    const laneItem: CaseLaneItem = {
      caseId: candidate.caseId,
      name: candidate.name,
      isCompleted: candidate.isCompleted,
      colorIndex: colorIndexForCase(candidate.caseId),
      startDayIndex: candidate.startDayIndex,
      endDayIndex: candidate.endDayIndex,
      openStart: candidate.openStart,
      openEnd: candidate.openEnd,
    };

    let placed = false;
    for (const lane of lanes) {
      const overlapsLane = lane.some(
        (existing) => laneItem.startDayIndex <= existing.endDayIndex && laneItem.endDayIndex >= existing.startDayIndex,
      );
      if (!overlapsLane) {
        lane.push(laneItem);
        placed = true;
        break;
      }
    }

    if (placed) {
      continue;
    }

    if (lanes.length < laneCap) {
      lanes.push([laneItem]);
    } else {
      overflow.push({
        caseId: candidate.caseId,
        name: candidate.name,
        rangeLabel: formatRangeLabel(candidate.startKey, candidate.endKey),
      });
    }
  }

  return { lanes, overflow };
}

// claude design's "週7行固定" logic (research.md "ビジュアルデザイン確定"):
// `bandRows = min(laneCount + (hasOverflow ? 1 : 0), maxLanes)`,
// `maxTasks = totalRows - bandRows`, so the case-lane band (including the
// overflow chip's own row, when present) and the task rows below it always
// sum to a fixed `totalRows` regardless of how many lanes a given week
// actually used.
export function computeWeekRowBudget(
  laneCount: number,
  hasOverflow: boolean,
  totalRows: number,
  maxLanes: number,
): WeekRowBudget {
  const bandRows = Math.min(laneCount + (hasOverflow ? 1 : 0), maxLanes);
  return { bandRows, maxTasks: totalRows - bandRows };
}
