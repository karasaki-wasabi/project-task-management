<!--
  Calendar page (tasks 4.1-4.4, design.md "Components and Interfaces >
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
  index.helpers.ts (tasks 3.1/3.2) — this file only owns fetching tasks
  and wiring those functions into a template, following the same
  `<script setup>` + `onMounted` + `useApiClient` pattern as
  kanban/index.vue and cases/index.vue.

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
  to always show all cases regardless of assignee selection;
  `caseSegmentsByDate` (task 4.2) already re-clips the already-fetched
  case list against `monthGrid` on every month change, so no network
  refetch is needed for cases to react to month navigation.

  Visual language follows kanban/cases: slate/primary palette, ring-1 card
  chrome, StatusBadge/PriorityBadge pills reused as-is (design.md Boundary
  Commitments — their internal implementation is out of this spec's
  scope).
-->
<script setup lang="ts">
import { computeTodayIso, generateMonthGrid, weekdayKanji, type DateCell } from "~/components/shared/DatePicker.helpers";
import { buildCaseSegments, buildTaskMarkersByDate, shiftMonth, truncateDayMarkers, type CaseSegmentPosition, type CaseSegmentView } from "./index.helpers";

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
async function load() {
  error.value = null;
  try {
    [tasks.value, cases.value, users.value, stages.value] = await Promise.all([
      api.listTasks({ assigneeUserId: assigneeUserId.value || undefined }),
      api.listCases(),
      api.listUsers(),
      api.listDevelopmentStages(),
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
                <div
                  v-if="segment.position === 'point'"
                  role="button"
                  tabindex="0"
                  class="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                  :aria-label="`${segment.name} の詳細を開く`"
                  @click="openCaseDetail(segment.caseId)"
                  @keydown.enter="openCaseDetail(segment.caseId)"
                >
                  <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="segment.isCompleted ? 'bg-slate-400' : 'bg-primary-500'" />
                  <span class="min-w-0 flex-1 truncate" :class="segment.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'">{{ segment.name }}</span>
                </div>
                <div
                  v-else
                  role="button"
                  tabindex="0"
                  class="cursor-pointer truncate px-1 py-0.5 text-[11px] leading-tight ring-1 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                  :aria-label="`${segment.name} の詳細を開く`"
                  :class="[
                    caseSegmentRoundingClass(segment.position),
                    segment.isCompleted ? 'bg-slate-100 text-slate-500 line-through ring-slate-200 hover:bg-slate-200' : 'bg-primary-100 text-primary-800 ring-primary-200 hover:bg-primary-200',
                  ]"
                  @click="openCaseDetail(segment.caseId)"
                  @keydown.enter="openCaseDetail(segment.caseId)"
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
                role="button"
                tabindex="0"
                class="flex cursor-pointer items-center gap-1 rounded bg-slate-50 px-1 py-0.5 text-[11px] leading-tight ring-1 ring-slate-100 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                :aria-label="`${marker.title} の詳細を開く`"
                @click="openTaskDetail(marker.taskId)"
                @keydown.enter="openTaskDetail(marker.taskId)"
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
