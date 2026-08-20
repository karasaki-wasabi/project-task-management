<script setup lang="ts">
import { computeTodayIso, generateMonthGrid, weekdayKanji, type DateCell } from "~/components/shared/DatePicker.helpers";
import type { OverflowListPopupItem } from "~/components/shared/OverflowListPopup.vue";
import {
  buildTaskMarkersByDate,
  buildWeekCaseLanes,
  collectWeekCasePopupItems,
  computeWeekRowBudget,
  formatCaseOverflowLabel,
  formatTaskOverflowLabel,
  shiftMonth,
  truncateDayMarkers,
  type CaseLaneItem,
} from "./index.helpers";

const TOTAL_ROWS_PER_WEEK = 7;
const MAX_CASE_LANES = 3;

const CASE_PALETTE: { text: string; hex: string }[] = [
  { text: "text-sky-800",     hex: "#e0f2fe" }, // 水色
  { text: "text-indigo-800",  hex: "#e0e7ff" }, // 藤色
  { text: "text-cyan-800",    hex: "#cffafe" }, // 空色
  { text: "text-violet-800",  hex: "#ede9fe" }, // 紫
  { text: "text-blue-800",    hex: "#dbeafe" }, // 薄い水色
  { text: "text-slate-700",   hex: "#e2e8f0" }, // スレート
];
const COMPLETED_CASE_PALETTE = { text: "text-slate-500 line-through", hex: "#e2e8f0" };

const CONTENT_ROW_HEIGHT_PX = 28;
const CASE_BAR_HEIGHT_PX = 20;
const TASK_ROW_INNER_HEIGHT_PX = 24;
const CASE_LANE_TOP_OFFSET_PX = 38;
const CASE_LANE_ROW_HEIGHT_PX = CONTENT_ROW_HEIGHT_PX;

const WEEK_GRID_COLUMNS_STYLE = { gridTemplateColumns: "0.72fr repeat(5, 1fr) 0.72fr" };
const WEEK_COLUMN_WEIGHTS = [0.72, 1, 1, 1, 1, 1, 0.72];
const WEEK_COLUMN_OFFSETS = WEEK_COLUMN_WEIGHTS.reduce<number[]>(
  (offsets, weight) => {
    offsets.push(offsets[offsets.length - 1]! + weight);
    return offsets;
  },
  [0],
);
const WEEK_COLUMN_TOTAL_WIDTH = WEEK_COLUMN_OFFSETS[WEEK_COLUMN_OFFSETS.length - 1]!;

const CASE_BAR_GAP_PX = 2;
function caseBarGeometry(item: CaseLaneItem): { left: string; width: string } {
  const leftOffset = WEEK_COLUMN_OFFSETS[item.startDayIndex]!;
  const rightOffset = WEEK_COLUMN_OFFSETS[item.endDayIndex + 1]!;
  const leftPct = (leftOffset / WEEK_COLUMN_TOTAL_WIDTH) * 100;
  const widthPct = ((rightOffset - leftOffset) / WEEK_COLUMN_TOTAL_WIDTH) * 100;
  return {
    left: `calc(${leftPct}% + ${CASE_BAR_GAP_PX}px)`,
    width: `calc(${widthPct}% - ${CASE_BAR_GAP_PX * 2}px)`,
  };
}

const CASE_OVERFLOW_CHIP_MIN_WIDTH_PX = 52;
const TASK_OVERFLOW_CHIP_MIN_WIDTH_PX = 58;
const OVERFLOW_CHIP_CLASS =
  "flex cursor-pointer items-center justify-center whitespace-nowrap rounded bg-slate-100 px-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500";
const OVERFLOW_CHIP_STYLE = {
  right: `${CASE_BAR_GAP_PX}px`,
  minWidth: `${CASE_OVERFLOW_CHIP_MIN_WIDTH_PX}px`,
  width: "auto",
};

const api = useApiClient();
const { currentId } = useCurrentWorkspace();

const now = new Date();
const todayIso = computeTodayIso(now);
const todayYear = now.getFullYear();
const todayMonth = now.getMonth() + 1;

const year = ref(todayYear);
const month = ref(todayMonth);

const tasks = ref<Task[]>([]);
const cases = ref<Case[]>([]);
const users = ref<User[]>([]);
const stages = ref<DevelopmentStage[]>([]);
const holidays = ref<NonBusinessDay[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

const assigneeUserId = ref("");

const selectedTaskId = ref<string | null>(null);
const selectedCaseId = ref<string | null>(null);

const hideCaseBars = ref(false);

const overflowPopup = ref<{ title: string; items: OverflowListPopupItem[] } | null>(null);

const weekdayColumns = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  label: weekdayKanji(dayOfWeek),
  class: dayOfWeek === 0 ? "text-[#c05a5a]" : dayOfWeek === 6 ? "text-[#5a7fc0]" : "text-slate-500",
}));

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

function cellDayNumberClass(cell: DateCell): string {
  if (!cell.inCurrentMonth) return "text-slate-300";
  if (isRedDay(cell)) return "text-[#c05a5a]";
  if (cell.dayOfWeek === 6) return "text-[#5a7fc0]";
  return "text-slate-700";
}

const holidayDateSet = computed(() => new Set(holidays.value.map((h) => h.date)));

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

const monthGrid = computed<DateCell[]>(() => generateMonthGrid(year.value, month.value, todayIso, ""));

const weekRows = computed(() => {
  const cells = monthGrid.value;
  const rows: DateCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
});

const monthLabel = computed(() => `${year.value}年${month.value}月`);

const markersByDate = computed(() => buildTaskMarkersByDate(tasks.value, stages.value, todayIso));

const weekCaseLanes = computed(() => weekRows.value.map((row) => buildWeekCaseLanes(row, cases.value, MAX_CASE_LANES)));

const rowBudgets = computed(() =>
  weekCaseLanes.value.map((wcl) =>
    computeWeekRowBudget(
      hideCaseBars.value ? 0 : wcl.lanes.length,
      hideCaseBars.value ? false : wcl.overflow.length > 0,
      TOTAL_ROWS_PER_WEEK,
      MAX_CASE_LANES,
    ),
  ),
);

function caseBarRoundingClass(item: CaseLaneItem): string {
  return [item.openStart ? "" : "rounded-l", item.openEnd ? "" : "rounded-r"].filter(Boolean).join(" ");
}

function casePalette(item: CaseLaneItem) {
  return item.isCompleted ? COMPLETED_CASE_PALETTE : (CASE_PALETTE[item.colorIndex] ?? CASE_PALETTE[0]!);
}

function caseBarStyle(item: CaseLaneItem): Record<string, string> {
  const { hex } = casePalette(item);
  if (!item.openStart && !item.openEnd) {
    return { backgroundColor: hex };
  }
  const left = item.openStart ? "transparent" : hex;
  const right = item.openEnd ? "transparent" : hex;
  return { backgroundImage: `linear-gradient(to right, ${left}, ${hex} 18%, ${hex} 82%, ${right})` };
}

function visibleMarkersFor(cell: DateCell, maxTasks: number) {
  return truncateDayMarkers(markersByDate.value.get(cell.date) ?? [], maxTasks);
}

async function loadTasks() {
  if (currentId.value === null) return;
  error.value = null;
  try {
    tasks.value = await api.listTasks({ assigneeUserId: assigneeUserId.value || undefined });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function load() {
  if (currentId.value === null) return;
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

function openTaskDetail(taskId: string) {
  selectedTaskId.value = taskId;
}
function closeTaskDetail() {
  selectedTaskId.value = null;
}
async function onTaskDetailSaved() {
  await load();
}
async function onTaskDetailDeleted() {
  selectedTaskId.value = null;
  await load();
}

function openCaseDetail(caseId: string) {
  selectedCaseId.value = caseId;
}
function closeCaseDetail() {
  selectedCaseId.value = null;
}
async function onCaseSaved() {
  await load();
}
async function onCaseDeleted() {
  selectedCaseId.value = null;
  await load();
}

function formatPopupDayTitle(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}
function formatPopupWeekRangeTitle(startKey: string, endKey: string): string {
  const short = (key: string) => {
    const [, m, d] = key.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return `${short(startKey)} 〜 ${short(endKey)}`;
}

function openDayTaskOverflowPopup(cell: DateCell) {
  const markers = markersByDate.value.get(cell.date) ?? [];
  overflowPopup.value = {
    title: formatPopupDayTitle(cell.date),
    items: markers.map((marker) => ({
      id: marker.taskId,
      kind: "task" as const,
      label: marker.title,
      meta: marker.stage ?? "未設定",
    })),
  };
}

function openWeekCaseOverflowPopup(weekDays: DateCell[], weekIndex: number) {
  const start = weekDays[0]?.date ?? "";
  const end = weekDays[weekDays.length - 1]?.date ?? "";
  const weekLanes = weekCaseLanes.value[weekIndex];
  if (!weekLanes) return;
  overflowPopup.value = {
    title: formatPopupWeekRangeTitle(start, end),
    items: collectWeekCasePopupItems(weekLanes, cases.value).map((item) => ({
      id: item.caseId,
      kind: "case" as const,
      label: item.name,
      meta: item.rangeLabel,
    })),
  };
}

function closeOverflowPopup() {
  overflowPopup.value = null;
}

function onOverflowSelect(kind: "task" | "case", id: string) {
  overflowPopup.value = null;
  if (kind === "task") {
    openTaskDetail(id);
  } else {
    openCaseDetail(id);
  }
}

function goToNextMonth() {
  ({ year: year.value, month: month.value } = shiftMonth(year.value, month.value, 1));
}
function goToPreviousMonth() {
  ({ year: year.value, month: month.value } = shiftMonth(year.value, month.value, -1));
}
function goToToday() {
  year.value = todayYear;
  month.value = todayMonth;
}

watch([year, month, assigneeUserId], () => {
  if (currentId.value === null) return;
  void loadTasks();
});

watch(
  currentId,
  (id) => {
    if (id === null) {
      tasks.value = [];
      cases.value = [];
      users.value = [];
      stages.value = [];
      holidays.value = [];
      loaded.value = false;
      error.value = null;
      return;
    }
    void load();
  },
  { immediate: true },
);
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

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <button
            type="button"
            role="switch"
            :aria-checked="!hideCaseBars"
            aria-label="案件バーを表示"
            class="toggle-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
            :class="!hideCaseBars ? 'bg-primary-600' : 'bg-slate-300'"
            @click="hideCaseBars = !hideCaseBars"
          >
            <span
              class="toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="!hideCaseBars ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </button>
          案件バーを表示
        </label>
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
        <div v-for="(row, rowIndex) in weekRows" :key="rowIndex" class="relative">
          <div class="grid divide-x divide-slate-100" :style="WEEK_GRID_COLUMNS_STYLE">
            <div v-for="cell in row" :key="cell.date" class="min-w-0 overflow-hidden p-1.5" :class="cellBackgroundClass(cell)">
              <div class="flex h-7 items-center gap-1 tabular-nums">
                <span
                  v-if="cell.isToday"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xl font-bold leading-none text-white"
                >{{ Number(cell.date.slice(8, 10)) }}</span>
                <span v-else class="text-xl font-bold leading-none" :class="cellDayNumberClass(cell)">{{ Number(cell.date.slice(8, 10)) }}</span>
                <span
                  v-if="holidayLabelFor(cell)"
                  class="truncate text-xs leading-none text-[#c05a5a]"
                  :title="holidayLabelFor(cell)"
                >{{ holidayLabelFor(cell) }}</span>
              </div>

              <div class="mt-1" :style="{ height: `${TOTAL_ROWS_PER_WEEK * CONTENT_ROW_HEIGHT_PX}px` }">
                <div
                  v-if="rowBudgets[rowIndex]!.bandRows > 0"
                  :style="{ height: `${rowBudgets[rowIndex]!.bandRows * CONTENT_ROW_HEIGHT_PX}px` }"
                />

                <div
                  v-for="marker in visibleMarkersFor(cell, rowBudgets[rowIndex]!.maxTasks).visible"
                  :key="marker.taskId"
                  class="flex items-center"
                  :style="{ height: `${CONTENT_ROW_HEIGHT_PX}px` }"
                >
                  <div
                    role="button"
                    tabindex="0"
                    class="flex w-full cursor-pointer items-center gap-1 rounded border px-1 text-xs leading-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                    :class="marker.isOverdue ? 'border-red-300 bg-red-50 hover:bg-red-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'"
                    :style="{ height: `${TASK_ROW_INNER_HEIGHT_PX}px` }"
                    :aria-label="`${marker.title} の詳細を開く`"
                    @click="openTaskDetail(marker.taskId)"
                    @keydown.enter="openTaskDetail(marker.taskId)"
                  >
                    <span class="min-w-0 flex-1 truncate" :class="marker.isOverdue ? 'font-bold text-red-700' : 'font-normal text-slate-800'">{{ marker.title }}</span>
                    <Badge tone="neutral" :label="marker.stage ?? '未設定'" />
                  </div>
                </div>

                <div
                  v-if="visibleMarkersFor(cell, rowBudgets[rowIndex]!.maxTasks).overflowCount > 0"
                  class="flex items-center justify-end"
                  :style="{ height: `${CONTENT_ROW_HEIGHT_PX}px` }"
                >
                  <button
                    type="button"
                    :class="OVERFLOW_CHIP_CLASS"
                    :style="{
                      minWidth: `${TASK_OVERFLOW_CHIP_MIN_WIDTH_PX}px`,
                      height: `${TASK_ROW_INNER_HEIGHT_PX}px`,
                    }"
                    :aria-label="`${cell.date} の残りのタスクを一覧表示`"
                    @click="openDayTaskOverflowPopup(cell)"
                  >
                    {{ formatTaskOverflowLabel(visibleMarkersFor(cell, rowBudgets[rowIndex]!.maxTasks).overflowCount) }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="!hideCaseBars"
            class="pointer-events-none absolute inset-x-0"
            :style="{
              top: `${CASE_LANE_TOP_OFFSET_PX}px`,
              height: `${MAX_CASE_LANES * CASE_LANE_ROW_HEIGHT_PX}px`,
            }"
          >
            <template v-for="(lane, laneIndex) in weekCaseLanes[rowIndex]!.lanes" :key="`lane-${laneIndex}`">
              <template v-for="item in lane" :key="item.caseId">
                <div
                  role="button"
                  tabindex="0"
                  class="pointer-events-auto absolute flex cursor-pointer items-center justify-center gap-0.5 overflow-hidden px-1.5 text-xs font-medium leading-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                  :class="[casePalette(item).text, caseBarRoundingClass(item)]"
                  :style="{
                    top: `${laneIndex * CASE_LANE_ROW_HEIGHT_PX + (CASE_LANE_ROW_HEIGHT_PX - CASE_BAR_HEIGHT_PX) / 2}px`,
                    height: `${CASE_BAR_HEIGHT_PX}px`,
                    ...caseBarGeometry(item),
                    ...caseBarStyle(item),
                  }"
                  :aria-label="`${item.name} の詳細を開く`"
                  @click="openCaseDetail(item.caseId)"
                  @keydown.enter="openCaseDetail(item.caseId)"
                >
                  <span v-if="item.openStart" class="shrink-0">‹</span>
                  <span class="min-w-0 truncate text-center">{{ item.name }}</span>
                  <span v-if="item.openEnd" class="shrink-0">›</span>
                </div>
              </template>
            </template>

            <div
              v-if="weekCaseLanes[rowIndex]!.overflow.length > 0"
              role="button"
              tabindex="0"
              class="pointer-events-auto absolute"
              :class="OVERFLOW_CHIP_CLASS"
              :style="{
                ...OVERFLOW_CHIP_STYLE,
                top: `${(rowBudgets[rowIndex]!.bandRows - 1) * CASE_LANE_ROW_HEIGHT_PX + (CASE_LANE_ROW_HEIGHT_PX - CASE_BAR_HEIGHT_PX) / 2}px`,
                height: `${CASE_BAR_HEIGHT_PX}px`,
              }"
              :aria-label="`${weekCaseLanes[rowIndex]!.overflow.length}件の案件を一覧表示`"
              @click="openWeekCaseOverflowPopup(row, rowIndex)"
              @keydown.enter="openWeekCaseOverflowPopup(row, rowIndex)"
            >
              {{ formatCaseOverflowLabel(weekCaseLanes[rowIndex]!.overflow.length) }}
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

    <OverflowListPopup
      :open="overflowPopup !== null"
      :title="overflowPopup?.title ?? ''"
      :items="overflowPopup?.items ?? []"
      @select="onOverflowSelect"
      @close="closeOverflowPopup"
    />
  </div>
</template>
