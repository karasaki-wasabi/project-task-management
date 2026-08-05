<!--
  Calendar page (task 4.1, design.md "Components and Interfaces >
  Frontend/calendar > CalendarPage", Requirements 1.1, 1.2, 1.3, 2.1, 2.2,
  2.3, 2.4, 2.5). This task is scoped strictly to the month grid and task
  deadline display — no case period bars (task 4.2), no month
  prev/next navigation UI or assignee filter (task 4.3), no task/case
  detail modals (task 4.4). `year`/`month` are plain refs a later task
  wires buttons to; there is no UI to change them yet.

  Month grid generation and per-day task marker truncation are pure
  functions reused from shared/DatePicker.helpers.ts and this page's own
  index.helpers.ts (tasks 3.1/3.2) — this file only owns fetching tasks
  and wiring those functions into a template, following the same
  `<script setup>` + `onMounted` + `useApiClient` pattern as
  kanban/index.vue and cases/index.vue.

  `generateMonthGrid` is called with an empty `selectedIso` ("") — unlike
  DatePicker.vue, this page has no concept of a single "selected date" to
  highlight (design.md: this isn't a date picker), only "today".

  Visual language follows kanban/cases: slate/primary palette, ring-1 card
  chrome, StatusBadge/PriorityBadge pills reused as-is (design.md Boundary
  Commitments — their internal implementation is out of this spec's
  scope).
-->
<script setup lang="ts">
import { computeTodayIso, generateMonthGrid, weekdayKanji, type DateCell } from "~/components/shared/DatePicker.helpers";
import { buildCaseSegments, buildTaskMarkersByDate, truncateDayMarkers, type CaseSegmentPosition, type CaseSegmentView } from "./index.helpers";

const api = useApiClient();

const now = new Date();
const todayIso = computeTodayIso(now);

// Requirement 4.1-4.3 (month navigation) is task 4.3's scope — these are
// plain refs, defaulted to the current year/month, with no UI to change
// them yet.
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1); // 1-indexed, matches generateMonthGrid

const tasks = ref<Task[]>([]);
const cases = ref<Case[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

const weekdayColumns = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  label: weekdayKanji(dayOfWeek),
  class: dayOfWeek === 0 ? "text-[#c05a5a]" : dayOfWeek === 6 ? "text-[#5a7fc0]" : "text-slate-500",
}));

// Requirement 1.1, 1.2: current month's full weeks, with today highlighted
// (Requirement 1.3 — via cell.isToday below). No selected-date concept on
// this page, so selectedIso is always "".
const monthGrid = computed<DateCell[]>(() => generateMonthGrid(year.value, month.value, todayIso, ""));

const weekRows = computed(() => {
  const cells = monthGrid.value;
  const rows: DateCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
});

const monthLabel = computed(() => `${year.value}年${month.value}月`);

// Requirement 2.1, 2.2: tasks without scheduledDate are excluded entirely
// by buildTaskMarkersByDate; recomputed whenever the fetched task list
// changes.
const markersByDate = computed(() => buildTaskMarkersByDate(tasks.value));

// Requirement 2.5: per-day truncation applied per cell so a busy day never
// overflows its cell.
function visibleMarkersFor(cell: DateCell) {
  return truncateDayMarkers(markersByDate.value.get(cell.date) ?? []);
}

// Requirement 3.1-3.4: case period bars/point markers, computed against the
// currently visible month grid (so a case's range is clipped to the cells
// actually on screen, per buildCaseSegments's contract). Requirement 5.3 —
// unlike tasks, this is intentionally NOT filtered by assignee (cases have
// no assignee field, and case bars must always show all cases).
const caseSegmentsByDate = computed<Map<string, CaseSegmentView[]>>(() => buildCaseSegments(monthGrid.value, cases.value));

function caseSegmentsFor(cell: DateCell): CaseSegmentView[] {
  return caseSegmentsByDate.value.get(cell.date) ?? [];
}

// Requirement 3.1, 3.4: start/single get a rounded left edge, end/single get
// a rounded right edge, middle stays square -- together, adjacent day cells'
// segments for the same case visually read as one continuous bar (see
// research.md "Light Discovery結果 3": per-cell chips, not pixel-positioned
// bars).
function caseSegmentRoundingClass(position: CaseSegmentPosition): string {
  switch (position) {
    case "single":
      return "rounded";
    case "start":
      return "rounded-l";
    case "end":
      return "rounded-r";
    default:
      return "";
  }
}

function cellDayClass(cell: DateCell): string {
  if (!cell.inCurrentMonth) return "text-slate-300";
  if (cell.isToday) return "font-semibold text-primary-600";
  if (cell.dayOfWeek === 0) return "text-[#c05a5a]";
  if (cell.dayOfWeek === 6) return "text-[#5a7fc0]";
  return "text-slate-700";
}

async function load() {
  error.value = null;
  try {
    [tasks.value, cases.value] = await Promise.all([api.listTasks(), api.listCases()]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">カレンダー</h1>
      <span class="text-sm font-medium tabular-nums text-slate-700">{{ monthLabel }}</span>
    </div>

    <ErrorAlert v-if="error" :message="error" />

    <div v-if="loaded" class="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
      <div class="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium">
        <div v-for="col in weekdayColumns" :key="col.dayOfWeek" class="px-2 py-2" :class="col.class">
          {{ col.label }}
        </div>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="(row, rowIndex) in weekRows" :key="rowIndex" class="grid grid-cols-7 divide-x divide-slate-100">
          <div
            v-for="cell in row"
            :key="cell.date"
            class="min-h-24 space-y-1 p-1.5"
            :class="cell.isToday ? 'bg-primary-50' : cell.inCurrentMonth ? 'bg-white' : 'bg-slate-50'"
          >
            <div class="text-xs tabular-nums" :class="cellDayClass(cell)">
              {{ Number(cell.date.slice(8, 10)) }}
            </div>

            <div v-if="caseSegmentsFor(cell).length > 0" class="space-y-0.5">
              <template v-for="segment in caseSegmentsFor(cell)" :key="`${segment.caseId}-${segment.position}`">
                <div v-if="segment.position === 'point'" class="flex items-center gap-1 px-1 py-0.5 text-[11px] leading-tight">
                  <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="segment.isCompleted ? 'bg-slate-400' : 'bg-primary-500'" />
                  <span class="min-w-0 flex-1 truncate" :class="segment.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'">{{ segment.name }}</span>
                </div>
                <div
                  v-else
                  class="truncate px-1 py-0.5 text-[11px] leading-tight ring-1"
                  :class="[
                    caseSegmentRoundingClass(segment.position),
                    segment.isCompleted ? 'bg-slate-100 text-slate-500 line-through ring-slate-200' : 'bg-primary-100 text-primary-800 ring-primary-200',
                  ]"
                >
                  <span v-if="segment.position === 'start' || segment.position === 'single'">{{ segment.name }}</span>
                  <span v-else>{{ " " }}</span>
                </div>
              </template>
            </div>

            <div class="space-y-0.5">
              <div
                v-for="marker in visibleMarkersFor(cell).visible"
                :key="marker.taskId"
                class="flex items-center gap-1 rounded bg-slate-50 px-1 py-0.5 text-[11px] leading-tight ring-1 ring-slate-100"
              >
                <span class="min-w-0 flex-1 truncate text-slate-800">{{ marker.title }}</span>
                <PriorityBadge :priority="marker.priority" />
                <StatusBadge :status="marker.status" />
              </div>

              <div v-if="visibleMarkersFor(cell).overflowCount > 0" class="px-1 text-[11px] text-slate-500">
                +{{ visibleMarkersFor(cell).overflowCount }}件
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
