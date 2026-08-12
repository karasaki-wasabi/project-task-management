<!--
  Calendar page (tasks 4.1-4.4, 7.3, 7.4, 7.5, 7.6; design.md "Components and
  Interfaces > Frontend/calendar > CalendarPage", Requirements 1.1, 1.2,
  1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2,
  4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 9.1, 9.2). Task 4.4 wires up
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

  TASK 7.4 (case-bar lane overlay, research.md "ビジュアルデザイン確定" /
  "週単位のレーン割り当て"): `weekCaseLanes` (per-week `buildWeekCaseLanes`
  result) drives both `rowBudgets` (real `laneCount`/`hasOverflow`, replacing
  task 7.3's interim `0, false` placeholders — `bandRows`/`maxTasks` now vary
  week to week as case bars actually occupy lanes) and the absolute-
  positioned overlay rendered once per week row (sibling of the day-cell
  grid inside a `position: relative` wrapper, not a child of the
  `divide-x`'d cell grid, so it doesn't pick up an unwanted divider border).
  Each lane row is placed via a pixel `top` offset; bars are shorter than
  the lane slot (`CASE_BAR_HEIGHT_PX`) so stacked lanes keep a vertical gap.
  `CASE_LANE_TOP_OFFSET_PX` includes cell padding so bars clear the date row
  (including today's circle). Each case's date span uses percentage `left`/
  `width` (`caseBarGeometry` — real day indices only, no hasOverflow clip).
  A spacer in each day cell reserves bandRows of lane height so tasks start
  below the overlay. Day cells use `min-w-0 overflow-hidden` so narrow Sat/Sun
  tracks cannot expand from long titles and desync the overlay. Overflow
  (Requirement 3.6) gets its own band row: `buildWeekCaseLanes` shrinks bar
  lanes to maxLanes-1 when any case overflows. `openCaseDetail` is invoked
  by each case bar's click/Enter handler.

  TASK 7.6 (`OverflowListPopup` integration, Requirements 2.6, 3.6,
  design.md State Management `overflowPopup` field): the daily task
  "+N件" button (`openDayTaskOverflowPopup`) reads the FULL untruncated
  per-day list from `markersByDate` (not `visibleMarkersFor`'s truncated
  `visible` subset -- the popup exists precisely to show what got cut off,
  so it re-lists everything for that day, matching research.md's mockup of
  a full re-listing rather than just the delta). The weekly case "他N件"
  chip (`openWeekCaseOverflowPopup`, now `pointer-events-auto` instead of
  the interim `-none` from task 7.4) builds the full week list via
  `collectWeekCasePopupItems` (lane-placed cases first, then overflow —
  matching Requirement 3.6's "その週の全案件"). Both set the local
  `overflowPopup` state (`{ title, items }`) that drives the single
  `OverflowListPopup` instance mounted below; its `select` emit closes the
  popup and reuses `openTaskDetail`/`openCaseDetail` (task 4.4) for the
  corresponding kind so only one detail modal or the popup is ever open at
  a time (design.md: "ポップアップの二重表示にならないよう排他制御する"),
  and `close` just clears `overflowPopup`.
-->
<script setup lang="ts">
import { computeTodayIso, generateMonthGrid, weekdayKanji, type DateCell } from "~/components/shared/DatePicker.helpers";
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
import type { OverflowListPopupItem } from "~/components/shared/OverflowListPopup.vue";

// research.md "ビジュアルデザイン確定": 週7行固定、案件レーンは最大3。
const TOTAL_ROWS_PER_WEEK = 7;
const MAX_CASE_LANES = 3;

// research.md "案件の配色": 6色パレットを`colorIndexForCase`のインデックス
// で固定割り当てする。完了案件はパレット色を使わずスレート+打ち消し線に
// 統一する(`COMPLETED_CASE_PALETTE`)。`hex`はopenStart/openEndのグラデー
// ションフェード(`caseBarStyle`)のグラデーション終端色としても使う。
const CASE_PALETTE: { text: string; hex: string }[] = [
  { text: "text-sky-800", hex: "#e0f2fe" }, // 水色
  { text: "text-indigo-800", hex: "#e0e7ff" }, // 藤色
  { text: "text-cyan-800", hex: "#cffafe" }, // 空色
  { text: "text-violet-800", hex: "#ede9fe" }, // 紫
  { text: "text-blue-800", hex: "#dbeafe" }, // 薄い水色
  { text: "text-slate-700", hex: "#e2e8f0" }, // スレート
];
const COMPLETED_CASE_PALETTE = { text: "text-slate-500 line-through", hex: "#e2e8f0" };

// 週コンテンツの行スロット。案件レーンとタスク行で同じ高さにし、週ごとに
// セル高さがタスク件数で伸び縮みしないようにする(常に TOTAL_ROWS_PER_WEEK
// スロット分を予約)。スロット内でバー/タスク本体を少し低くし、隣接行の
// 縦隙間を確保する(期限超過の赤背景が密着して隙間ゼロに見えないように)。
// `CASE_LANE_TOP_OFFSET_PX` = セル上padding(p-1.5=6) + 日付行(h-7=28) +
// 日付直下の余白(4) = 38。日付数字は text-xl(1.25rem)+bold。
const CONTENT_ROW_HEIGHT_PX = 28;
const CASE_BAR_HEIGHT_PX = 20;
const TASK_ROW_INNER_HEIGHT_PX = 24;
const CASE_LANE_TOP_OFFSET_PX = 38;
// 互換エイリアス: 案件オーバーレイは CONTENT_ROW_HEIGHT_PX をレーン高に使う
const CASE_LANE_ROW_HEIGHT_PX = CONTENT_ROW_HEIGHT_PX;

// claude design column-width ratio (research.md "列幅は日曜・土曜のみ狭める
// (0.72fr vs 平日1fr)"): applied identically to the weekday header row and
// every week row so columns line up.
const WEEK_GRID_COLUMNS_STYLE = { gridTemplateColumns: "0.72fr repeat(5, 1fr) 0.72fr" };

// Remediation (task 7.4 review round 3, geometry model kept through round 4):
// the case-lane overlay used to mirror WEEK_GRID_COLUMNS_STYLE via CSS Grid
// `grid-column` spans (`caseBarGridColumn`, removed). CSS Grid's column
// tracks are fundamentally discrete, which made it impossible to express
// fractional/sub-column widths precisely. This is replaced with
// percentage-based absolute positioning (`left`/`width` on the overlay's
// `position: absolute` bars, resolved against the week row's actual pixel
// width): percentages can express any fractional column boundary exactly.
// `WEEK_COLUMN_WEIGHTS` mirrors WEEK_GRID_COLUMNS_STYLE's `0.72fr repeat(5,
// 1fr) 0.72fr` track sizes (same weekend-narrowing ratio) so the overlay's
// bars line up with the day-cell grid beneath despite not using CSS Grid
// itself; `WEEK_COLUMN_OFFSETS[i]` is the cumulative left edge of column `i`
// in those weight units (0..7 entries for columns 0..6 plus the trailing
// right edge), and dividing by `WEEK_COLUMN_TOTAL_WIDTH` converts a
// weight-unit offset to a 0-100 percentage. (Round 4: this percentage model
// is retained for bar geometry, but round 2-3's Saturday-column-reservation
// use of it for collision avoidance was removed — see `caseBarGeometry`'s
// comment.)
const WEEK_COLUMN_WEIGHTS = [0.72, 1, 1, 1, 1, 1, 0.72];
const WEEK_COLUMN_OFFSETS = WEEK_COLUMN_WEIGHTS.reduce<number[]>(
  (offsets, weight) => {
    offsets.push(offsets[offsets.length - 1]! + weight);
    return offsets;
  },
  [0],
);
const WEEK_COLUMN_TOTAL_WIDTH = WEEK_COLUMN_OFFSETS[WEEK_COLUMN_OFFSETS.length - 1]!;

// Small fixed pixel gap carved out of each bar's computed box via `calc()`,
// replacing the old `mx-0.5` margin utility: margin on an absolutely
// positioned box (with `left`/`width` both set) shifts the box rather than
// shrinking it symmetrically inside the [left, left+width] span, which would
// let a bar's true right edge drift past the boundary this fix depends on
// being exact. Baking the inset into `left`/`width` themselves keeps the
// rendered box provably inside its computed column span.
const CASE_BAR_GAP_PX = 2;

// Remediation (task 7.4 review round 4, debug-confirmed root cause): rounds
// 2-3 reserved the entire Saturday column for the "他N件" overflow chip
// whenever a week had overflow (clipping every bar's end to `min(end, 5)`).
// That full-column reservation was never a design mandate — research.md
// "週の右端に「他N件」チップ" only asks for a chip at the week's right edge,
// not a reserved column — and it actively broke the Saturday-only-segment
// case (`startDayIndex === endDayIndex === 6`): the clip collapsed the bar's
// range to empty/invalid and the geometry function returned `null`, so the
// template silently hid a bar that `buildWeekCaseLanes` had legitimately
// placed in a normal lane. Every `CaseLaneItem` now always computes its
// `left`/`width` directly from its own real `startDayIndex`/`endDayIndex`
// (0-6) — no `hasOverflow`-dependent clip, no `null`-return path — so a
// lane item renders for any day-index combination and any `hasOverflow`
// value, by construction. The overflow chip no longer reserves a column at
// all; it's a small fixed-size badge anchored to the row's right edge
// instead (see `OVERFLOW_CHIP_STYLE` below), so any bar it visually overlaps
// in that small corner stays clickable underneath it via `pointer-events`.
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

// Overflow chips (案件・タスク共通の見た目): slate 角バッジ + whitespace-
// nowrap。幅は各ラベルの最長形(「他9+件」/「他99+件」)が入るよう予約する。
// 案件チップは週行右端アンカー、タスクチップは日セル内で右寄せ。
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

// Requirement 9.1, 9.2, design.md State Management (`hideCaseBars: boolean`):
// local UI-only toggle for the case-lane overlay, no API re-fetch involved
// (design.md "Persistence & consistency"). Default false — Requirement 9.1
// requires case bars to be shown initially.
const hideCaseBars = ref(false);

// Requirement 2.6, 3.6, design.md State Management
// (`overflowPopup: { kind, items } | null`): which "他N件" list popup is
// currently open, following the same nullable-state-as-open convention as
// `selectedTaskId`/`selectedCaseId` above. `title` is derived here (the
// design.md State Management field only specifies `kind`/`items`; the
// popup's own props also require a `title`, so it's carried alongside them
// in this local state shape rather than recomputed at render time).
const overflowPopup = ref<{ title: string; items: OverflowListPopupItem[] } | null>(null);

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

// Requirement 3.1-3.6, task 7.4: per-week case lane assignment, indexed in
// parallel with `weekRows`. Cases are fetched once (Requirement 5.3 — case
// bars are always unfiltered) and re-laned whenever the displayed month or
// the case list changes.
const weekCaseLanes = computed(() => weekRows.value.map((row) => buildWeekCaseLanes(row, cases.value, MAX_CASE_LANES)));

// claude design "週7行固定" (research.md "ビジュアルデザイン確定"): each
// week row's task-row budget is derived from computeWeekRowBudget, using
// the real lane count / overflow-presence from `weekCaseLanes` for that
// week (task 7.4, replacing task 7.3's interim `0, false` placeholders) —
// `maxTasks` now varies week to week as case bars actually occupy lanes.
// Requirement 9.2: when `hideCaseBars` is on, the case-lane band collapses
// to 0 rows (same `laneCount: 0, hasOverflow: false` call shape as task 7.3's
// original interim placeholder, task 7.5 detail bullets) so task rows expand
// to use the full TOTAL_ROWS_PER_WEEK budget for that week.
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

// research.md: rounded corner at whichever edge is NOT open (a real
// start/end date at that edge); an open edge instead gets the gradient
// fade from `caseBarStyle` plus a ‹/› arrow glyph in the template.
function caseBarRoundingClass(item: CaseLaneItem): string {
  return [item.openStart ? "" : "rounded-l", item.openEnd ? "" : "rounded-r"].filter(Boolean).join(" ");
}

function casePalette(item: CaseLaneItem) {
  return item.isCompleted ? COMPLETED_CASE_PALETTE : (CASE_PALETTE[item.colorIndex] ?? CASE_PALETTE[0]!);
}

// research.md "開始日/終了日未定の案件...グラデーションでフェード": fades
// to transparent at whichever edge is open (openStart/openEnd), otherwise a
// flat palette fill.
function caseBarStyle(item: CaseLaneItem): Record<string, string> {
  const { hex } = casePalette(item);
  if (!item.openStart && !item.openEnd) {
    return { backgroundColor: hex };
  }
  const left = item.openStart ? "transparent" : hex;
  const right = item.openEnd ? "transparent" : hex;
  return { backgroundImage: `linear-gradient(to right, ${left}, ${hex} 18%, ${hex} 82%, ${right})` };
}

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
  if (currentId.value === null) return;
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

// Requirement 2.6, 3.6 popup title formatting: a plain local formatter
// (kept in this file, not index.helpers.ts's unexported `formatMonthDay`)
// since these strings are template-facing labels, not derived calendar
// data. `formatPopupDayTitle` matches this page's other date-key handling
// (`YYYY-MM-DD` strings, sliced directly -- see index.helpers.ts's header
// comment on why no `Date` round-trip is used for these already-local-date
// strings).
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

// Requirement 2.6: opens OverflowListPopup with ALL of that day's task
// markers (not just the truncated `visible` subset `visibleMarkersFor`
// returns for cell rendering) -- looked up directly from `markersByDate`,
// which always holds the full untruncated per-day list.
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

// Requirement 3.6 / tasks.md 7.6: opens OverflowListPopup with ALL cases
// that intersect this week (lane-placed + overflow), not only the omitted
// ones — research.md "その週の全案件を一覧表示".
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

// design.md Implementation Notes: "OverflowListPopupから行が選択されると
// overflowPopupを閉じ、selectedTaskId/selectedCaseIdを設定して該当の詳細
// モーダルを開く(ポップアップの二重表示にならないよう排他制御する)" --
// reuses openTaskDetail/openCaseDetail (task 4.4) rather than duplicating
// that assignment logic.
function onOverflowSelect(kind: "task" | "case", id: string) {
  overflowPopup.value = null;
  if (kind === "task") {
    openTaskDetail(id);
  } else {
    openCaseDetail(id);
  }
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

        <!-- Requirement 9.1, 9.2: exact same toggle-switch visual pattern as
             CaseDetailModal.vue's "この案件を完了にする" (role="switch",
             toggle-switch/toggle-knob classes, bg-primary-600/bg-slate-300,
             translate-x-4/translate-x-0.5), not the button-style mockup
             (research.md "「案件バー」表示切替"). -->
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
            <!-- min-w-0: grid items default to min-width:auto and long task
                 titles/badges (especially in the already-narrow Sat/Sun
                 0.72fr columns) expand the track, which desyncs percentage-
                 positioned case bars from the day-cell boundaries.
                 Content below the date always reserves TOTAL_ROWS_PER_WEEK
                 fixed slots so week/cell height does not depend on how many
                 tasks are actually rendered. -->
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
                <!-- Case-lane spacer (overlay is painted once per week row). -->
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

          <!-- Requirement 3.1-3.6, task 7.4 (remediation round 4): absolute-
               positioned case-lane overlay for this week row, using
               percentage `left`/`width` geometry (`caseBarGeometry`) instead
               of CSS Grid `grid-column` spans (percentages can express any
               fractional column boundary exactly, so bars line up with the
               day-cell grid beneath despite not using CSS Grid themselves).
               Every lane item always renders — no `hasOverflow`-dependent
               clip, no `null`-return path — see `caseBarGeometry`'s comment.
               `pointer-events-none` on the overlay itself (so it never
               blocks clicks on the day cells beneath it) with
               `pointer-events-auto` re-enabled per bar so each case segment
               stays clickable. Each bar's `top` is a plain pixel offset from
               `laneIndex * CASE_LANE_ROW_HEIGHT_PX`. -->
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

            <!-- Requirement 3.6: cases that didn't fit within the bar-lane
                 budget render as a right-aligned "他N件" chip on its OWN
                 band row (research.md `bandRows = min(lanes + dropped,
                 maxLanes)`). `buildWeekCaseLanes` shrinks bar lanes to
                 maxLanes-1 whenever overflow is non-empty, so this chip
                 never shares a row with a bar and no longer needs to paint
                 over Saturday segments. `OVERFLOW_CHIP_STYLE` is a small
                 fixed-size badge at the week's right edge (not a reserved
                 column — see `caseBarGeometry`). Task 7.6: clickable to open
                 OverflowListPopup with this week's full case list
                 (lanes + overflow via collectWeekCasePopupItems). -->
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
