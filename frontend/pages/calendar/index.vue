<!--
  Calendar page (tasks 4.1-4.4, 7.3; design.md "Components and Interfaces >
  Frontend/calendar > CalendarPage", Requirements 1.1, 1.2, 1.3, 2.1, 2.2,
  2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2). Task 4.4 wires up
  TaskDetailModal/CaseDetailModal (`selectedTaskId`/`selectedCaseId`,
  design.md State Management), reusing both components exactly as built by
  the kanban/cases specs — this page never edits their source, only
  supplies the props/emits contract they already define. `users`/`stages`
  are fetched once in `load()` (design.md Implementation Notes: "kanban/
  index.vueと同様にこれらの一覧も併せて取得する") solely because
  TaskDetailModal requires them as props; this page itself never creates,
  edits, or deletes tasks/cases directly (both modals do that internally
  and this page only reacts to their `saved`/`deleted` emits by re-running
  `load()`, same as kanban/index.vue and cases/index.vue).

  Month grid generation and per-day task marker truncation are pure
  functions reused from shared/DatePicker.helpers.ts and this page's own
  index.helpers.ts (tasks 3.1/3.2, replaced by 7.2's week-lane-based
  helpers) — this file only owns fetching tasks and wiring those functions
  into a template, following the same `<script setup>` + `onMounted` +
  `useApiClient` pattern as kanban/index.vue and cases/index.vue.

  `generateMonthGrid` is called with an empty `selectedIso` ("") — unlike
  DatePicker.vue, this page has no concept of a single "selected date" to
  highlight (design.md: this isn't a date picker), only "today".

  Requirement 4.1-4.3 / design.md State Management: month navigation and
  assignee filtering both re-trigger `listTasks({ assigneeUserId })`
  (`watch([year, month, assigneeUserId], loadTasks)`), following the same
  `watch(...) -> load()` pattern as tasks/index.vue's AssigneeFilter
  integration. Cases are fetched once at mount and NOT re-fetched on month
  navigation or assignee change: `listCases()` has no filter param
  (confirmed unfiltered, task 4.2) and Requirement 5.3 requires case bars
  to always show all cases regardless of assignee selection.

  Visual language follows kanban/cases: slate/primary palette, ring-1 card
  chrome (design.md Boundary Commitments — their internal implementation is
  out of this spec's scope), with the claude-design-confirmed exceptions
  documented in research.md "ビジュアルデザイン確定": whole-cell weekend/
  today tinting (accepted as the same kind of exception as the existing
  `danger-bg` overdue-panel treatment) and a stage badge + red
  background/ring/bold-title overdue treatment for task rows in place of
  the original StatusBadge/PriorityBadge pair.

  TASK 7.3 SCOPING NOTE (case-bar rendering intentionally deferred to task
  7.4): `buildCaseSegments` (the old day-cell-position algorithm this page
  used to call) was removed in task 7.2 and replaced by
  `buildWeekCaseLanes`/`computeWeekRowBudget` (a week-based greedy lane
  assignment, research.md "週単位のレーン割り当て"). Task 7.4 owns building
  the actual absolute-positioned lane overlay from `buildWeekCaseLanes`.
  This task (7.3) only restores compilation and rebuilds the task-display
  portion of the grid; it deliberately does NOT call `buildWeekCaseLanes`
  or render any case-bar UI yet — doing so now would be thrown away and
  redone by 7.4 with the real lane geometry. `computeWeekRowBudget` is
  still wired in for real (not hardcoded elsewhere) using an interim
  `laneCount: 0, hasOverflow: false` per week (see `rowBudgets` below);
  task 7.4 will replace those two literals with real values sourced from
  `buildWeekCaseLanes`, which will make `bandRows` vary week to week once
  case bars actually render. Until then, every week's budget is identical
  by construction, which trivially satisfies this task's "week rows appear
  consistent in height" observable-done bullet. `openCaseDetail`/
  `selectedCaseId`/`CaseDetailModal` are kept wired (Requirement 6.2, task
  4.4) even though nothing in this task's template calls `openCaseDetail`
  yet — task 7.4 will invoke it from the new lane overlay's click handler.
-->
<script setup lang="ts">
import { computeTodayIso, generateMonthGrid, weekdayKanji, type DateCell } from "~/components/shared/DatePicker.helpers";
import { buildTaskMarkersByDate, computeWeekRowBudget, shiftMonth, truncateDayMarkers } from "./index.helpers";

// research.md "ビジュアルデザイン確定": 週7行固定、案件レーンは最大3。
const TOTAL_ROWS_PER_WEEK = 7;
const MAX_CASE_LANES = 3;

// claude design column-width ratio (research.md "列幅は日曜・土曜のみ狭める
// (0.72fr vs 平日1fr)"): applied identically to the weekday header row and
// every week row so columns line up.
const WEEK_GRID_COLUMNS_STYLE = { gridTemplateColumns: "0.72fr repeat(5, 1fr) 0.72fr" };

const api = useApiClient();

const now = new Date();
const todayIso = computeTodayIso(now);
const todayYear = now.getFullYear();
const todayMonth = now.getMonth() + 1; // 1-indexed, matches generateMonthGrid

// Requirement 4.1-4.3: displayed year/month, moved by shiftMonth via the
// prev/next/today controls below.
const year = ref(todayYear);
const month = ref(todayMonth);

const tasks = ref<Task[]>([]);
const cases = ref<Case[]>([]);
const users = ref<User[]>([]);
const stages = ref<DevelopmentStage[]>([]);
const holidays = ref<NonBusinessDay[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

// Requirement 5.1, 5.2: single-select assignee filter, "" (AssigneeFilter's
// empty-string convention) means "すべて" / no filter.
const assigneeUserId = ref("");

// Requirement 6.1, 6.2, design.md State Management: which task/case detail
// modal is currently open, following the same nullable-id-as-open-state
// convention as kanban/index.vue's `detailTaskId` / cases/index.vue's
// `activeCaseId`.
const selectedTaskId = ref<string | null>(null);
const selectedCaseId = ref<string | null>(null);

const weekdayColumns = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  label: weekdayKanji(dayOfWeek),
  class: dayOfWeek === 0 ? "text-[#c05a5a]" : dayOfWeek === 6 ? "text-[#5a7fc0]" : "text-slate-500",
}));

// claude design ("日セルの色分け", research.md "ビジュアルデザイン確定"):
// today wins over the weekend/holiday tint (a weekend or holiday "今日" cell
// is still the pale yellow "今日" treatment, never the red/blue weekend
// treatment), matching the same isToday-checked-first precedence the old
// `cellDayClass` used. Whole-cell background tinting is an accepted
// badge-only-rule exception (research.md, same spirit as the existing
// `danger-bg` overdue exception).
//
// Holidays (design.md/tasks.md updated to allow `useApiClient.ts`'s existing
// `listHolidays()` as a dependency for this): fetched once in `load()`
// alongside tasks/cases/users/stages (same "fetch once, filter client-side"
// convention as the rest of this page) and looked up by exact date-string
// match against `holidayDateSet`. A holiday cell gets the same pale-red/
// red-text treatment as Sunday, so the check is a simple `||` alongside the
// existing `dayOfWeek === 0` Sunday check rather than a separate tier.
function isRedDay(cell: DateCell): boolean {
  return cell.dayOfWeek === 0 || holidayDateSet.value.has(cell.date);
}

function cellBackgroundClass(cell: DateCell): string {
  if (cell.isToday) return "bg-amber-50";
  if (!cell.inCurrentMonth) return "bg-slate-50";
  if (isRedDay(cell)) return "bg-red-50";
  if (cell.dayOfWeek === 6) return "bg-blue-50";
  return "bg-white";
}

// Text color for the date number on non-today cells; today instead renders
// as a black-filled circle (see template) rather than colored text.
function cellDayNumberClass(cell: DateCell): string {
  if (!cell.inCurrentMonth) return "text-slate-300";
  if (isRedDay(cell)) return "text-[#c05a5a]";
  if (cell.dayOfWeek === 6) return "text-[#5a7fc0]";
  return "text-slate-700";
}

// NonBusinessDay.date is already a plain "YYYY-MM-DD" string at the API
// boundary (backend/src/modules/holidays/holiday.types.ts), matching
// DateCell.date's format exactly, so no toLocalDateKey-style slicing is
// needed here (unlike Task.scheduledDate/Case.startDate, which carry full
// timestamp strings elsewhere in this page's helpers).
const holidayDateSet = computed(() => new Set(holidays.value.map((h) => h.date)));

// Holiday label lookup for the small red label rendered next to the date
// number (research.md mockup, e.g. "海の日"); manual holidays registered
// without a label render tinting only, since NonBusinessDay.label is
// optional (`label?: string`) — no fabricated text.
const holidayLabelByDate = computed(() => {
  const map = new Map<string, string>();
  for (const h of holidays.value) {
    if (h.label) map.set(h.date, h.label);
  }
  return map;
});

function holidayLabelFor(cell: DateCell): string | undefined {
  return holidayLabelByDate.value.get(cell.date);
}

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

// Requirement 2.1, 2.2, 2.3, 2.4: tasks without scheduledDate are excluded
// entirely by buildTaskMarkersByDate; each marker carries a resolved
// `stage` label and `isOverdue` flag (task 7.2). Recomputed whenever the
// fetched task/stage list or the day changes.
const markersByDate = computed(() => buildTaskMarkersByDate(tasks.value, stages.value, todayIso));

// claude design "週7行固定" (research.md "ビジュアルデザイン確定"): each
// week row's task-row budget is derived from computeWeekRowBudget, indexed
// in parallel with `weekRows`. Case-lane rendering itself is task 7.4's
// job (see file header TASK 7.3 SCOPING NOTE) — until then every week uses
// the same interim `laneCount: 0, hasOverflow: false`, so `maxTasks` is
// identical across weeks, but the budget function itself (not a hardcoded
// row count) is what determines it here.
const rowBudgets = computed(() => weekRows.value.map(() => computeWeekRowBudget(0, false, TOTAL_ROWS_PER_WEEK, MAX_CASE_LANES)));

// Requirement 2.5: per-day truncation applied per cell, using that cell's
// week's task-row budget, so a busy day never overflows its cell.
function visibleMarkersFor(cell: DateCell, maxTasks: number) {
  return truncateDayMarkers(markersByDate.value.get(cell.date) ?? [], maxTasks);
}

// Requirement 5.1, 5.2: server-side assignee filter, following the same
// `assigneeUserId.value || undefined` convention as tasks/index.vue and
// kanban/index.vue. Does not touch `cases` (Requirement 5.3 — case bars are
// always unfiltered, and listCases has no filter param, task 4.2).
async function loadTasks() {
  error.value = null;
  try {
    tasks.value = await api.listTasks({ assigneeUserId: assigneeUserId.value || undefined });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

// Requirement 6.1: TaskDetailModal requires `users`/`stages` as props (design.md
// Implementation Notes — "kanban/index.vueと同様にこれらの一覧も併せて取得する"),
// fetched once alongside tasks/cases; unlike `assigneeUserId`, they have no
// month/filter dependency so they are not part of `loadTasks`'s re-fetch.
// `holidays` (task 7.3 gap fix, design.md/tasks.md "Allowed Dependencies")
// is fetched the same way: `listHolidays()` has no date-range filter, and
// following this page's existing "fetch once, filter client-side"
// convention, the full list is fetched once here rather than re-fetched per
// month.
async function load() {
  error.value = null;
  try {
    [tasks.value, cases.value, users.value, stages.value, holidays.value] = await Promise.all([
      api.listTasks({ assigneeUserId: assigneeUserId.value || undefined }),
      api.listCases(),
      api.listUsers(),
      api.listDevelopmentStages(),
      api.listHolidays(),
    ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

// Requirement 6.1: opens TaskDetailModal for the clicked task marker.
function openTaskDetail(taskId: string) {
  selectedTaskId.value = taskId;
}
function closeTaskDetail() {
  selectedTaskId.value = null;
}
// TaskDetailModal returns to view mode internally after a save (same pattern
// as kanban/index.vue's onTaskDetailSaved) -- keep it open and just refresh
// the calendar's own data so the updated title/status/assignee/date is
// reflected in place.
async function onTaskDetailSaved() {
  await load();
}
async function onTaskDetailDeleted() {
  selectedTaskId.value = null;
  await load();
}

// Requirement 6.2: opens CaseDetailModal for the clicked case segment.
function openCaseDetail(caseId: string) {
  selectedCaseId.value = caseId;
}
function closeCaseDetail() {
  selectedCaseId.value = null;
}
// Same pattern as cases/index.vue's onCaseSaved/onCaseDeleted.
async function onCaseSaved() {
  await load();
}
async function onCaseDeleted() {
  selectedCaseId.value = null;
  await load();
}

// Requirement 4.1, 4.2: next/prev month via shiftMonth (task 3.1).
function goToNextMonth() {
  ({ year: year.value, month: month.value } = shiftMonth(year.value, month.value, 1));
}
function goToPreviousMonth() {
  ({ year: year.value, month: month.value } = shiftMonth(year.value, month.value, -1));
}
// Requirement 4.3: back to the current real-world month.
function goToToday() {
  year.value = todayYear;
  month.value = todayMonth;
}

// Requirement 4.1-4.3, 5.1, 5.2, design.md State Management: month
// navigation and assignee-filter changes both re-fetch tasks via
// `loadTasks` (server-side `assigneeUserId` filter); cases are fetched only
// once at mount (see file header comment for why month navigation doesn't
// need a cases re-fetch).
watch([year, month, assigneeUserId], loadTasks);

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">カレンダー</h1>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="前月"
            @click="goToPreviousMonth"
          >
            &lt;
          </button>
          <span class="min-w-20 text-center text-sm font-medium tabular-nums text-slate-700">{{ monthLabel }}</span>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="次月"
            @click="goToNextMonth"
          >
            &gt;
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="goToToday"
          >
            今月
          </button>
        </div>

        <AssigneeFilter v-model="assigneeUserId" />
      </div>
    </div>

    <ErrorAlert v-if="error" :message="error" />

    <div v-if="loaded" class="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
      <div class="grid border-b border-slate-200 bg-slate-50 text-center text-xs font-medium" :style="WEEK_GRID_COLUMNS_STYLE">
        <div v-for="col in weekdayColumns" :key="col.dayOfWeek" class="px-2 py-2" :class="col.class">
          {{ col.label }}
        </div>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="(row, rowIndex) in weekRows" :key="rowIndex" class="grid divide-x divide-slate-100" :style="WEEK_GRID_COLUMNS_STYLE">
          <div v-for="cell in row" :key="cell.date" class="min-h-24 space-y-1 p-1.5" :class="cellBackgroundClass(cell)">
            <div class="flex items-center gap-1 text-xs tabular-nums">
              <span
                v-if="cell.isToday"
                class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 font-semibold text-white"
              >{{ Number(cell.date.slice(8, 10)) }}</span>
              <span v-else :class="cellDayNumberClass(cell)">{{ Number(cell.date.slice(8, 10)) }}</span>
              <span
                v-if="holidayLabelFor(cell)"
                class="truncate text-[10px] leading-none text-[#c05a5a]"
                :title="holidayLabelFor(cell)"
              >{{ holidayLabelFor(cell) }}</span>
            </div>

            <!-- Task 7.4 will render the buildWeekCaseLanes overlay here
                 (see file header TASK 7.3 SCOPING NOTE); this task
                 intentionally renders no case-bar UI yet. -->

            <div class="space-y-0.5">
              <div
                v-for="marker in visibleMarkersFor(cell, rowBudgets[rowIndex]!.maxTasks).visible"
                :key="marker.taskId"
                role="button"
                tabindex="0"
                class="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight ring-1 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                :class="marker.isOverdue ? 'bg-red-50 ring-red-300 hover:bg-red-100' : 'bg-slate-50 ring-slate-100 hover:bg-slate-100'"
                :aria-label="`${marker.title} の詳細を開く`"
                @click="openTaskDetail(marker.taskId)"
                @keydown.enter="openTaskDetail(marker.taskId)"
              >
                <span class="min-w-0 flex-1 truncate" :class="marker.isOverdue ? 'font-bold text-red-700' : 'text-slate-800'">{{ marker.title }}</span>
                <Badge tone="neutral" :label="marker.stage ?? '未設定'" />
              </div>

              <div v-if="visibleMarkersFor(cell, rowBudgets[rowIndex]!.maxTasks).overflowCount > 0" class="px-1 text-[11px] text-slate-500">
                +{{ visibleMarkersFor(cell, rowBudgets[rowIndex]!.maxTasks).overflowCount }}件
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <TaskDetailModal
      :task-id="selectedTaskId"
      :users="users"
      :stages="stages"
      :cases="cases"
      @close="closeTaskDetail"
      @saved="onTaskDetailSaved"
      @deleted="onTaskDetailDeleted"
    />

    <CaseDetailModal :case-id="selectedCaseId" @close="closeCaseDetail" @saved="onCaseSaved" @deleted="onCaseDeleted" />
  </div>
</template>
