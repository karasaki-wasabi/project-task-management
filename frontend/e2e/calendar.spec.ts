// E2E: calendar screen's main flows (tasks 6.1 / 7.7, design.md Testing
// Strategy "E2E Tests", Requirements 1.1-1.3, 2.1-2.6, 3.1-3.6, 4.1-4.3,
// 5.1-5.3, 6.1-6.2, 9.1-9.2).
//
// Task 7.7 refreshes assertions for the claude-design visual rewrite:
// task rows show title + development-stage badge (no status/priority
// badges), case periods render as week-lane overlay bars (not per-day
// segments), and new scenarios cover weekly "他N件" → OverflowListPopup
// → CaseDetailModal plus the "案件バーを表示" toggle.
//
// Case-bar scenarios call `purgePollutingCalendarCases` first: open-ended
// cases and prior `e2e-cal-*` rows on the shared dev DB otherwise saturate
// every week-lane budget (see that helper's comment).
//
// Test-data setup notes (see recurrence-holidays-ux task 8.2, prior
// task-case-calendar 6.1, and .kiro/steering/testing.md):
// - Cases: `startDate`/`endDate` are fully settable through the real
//   CaseFormModal UI (/cases), so case period bars are driven end-to-end
//   through actual form interaction, same as cases.spec.ts. Missing one
//   or both dates opens CaseTemplateApplyConfirm (Screen A); helpers
//   approve with 「作成する」. Case-bar fixtures POST with
//   `templateOperations: []` so leftover active templates do not inject
//   tasks into shared-dev-DB runs.
// - Tasks: there is no UI path to set an arbitrary task's `scheduledEndDate`
//   directly (task.routes.ts's Zod create/update schemas don't accept it).
//   The legitimate UI path is case-relative templates (/recurrence Modal)
//   plus case create with both dates set (omit `templateOperations` →
//   server applies full candidates, Req 3.4). Templates use
//   `case_start` / offset 0 / `as_is` so instances land on the case
//   startDate (= today for marker tests).
// - Because generated instances land with today's date, and the dev DB
//   accumulates data across runs (testing.md), today's day-cell could in
//   principle already hold enough unrelated tasks to push new ones into
//   the 「他N件」 overflow. To keep marker-visibility assertions robust
//   against that, tasks used for direct marker/badge/modal assertions are
//   always checked through the assignee filter narrowed to a *brand-new*
//   user created earlier in the same test — a user that has never been
//   assigned any pre-existing task, so its filtered result set is
//   guaranteed to contain only the task(s) this test just created and
//   assigned. Requirement 5.1 ("すべて" aggregates all assignees) is
//   proven via a day-cell footprint count (visible markers + overflow
//   number) compared against the known-exact single-assignee baseline,
//   not via direct visibility of specific task titles in the unfiltered
//   view, for the same reason.
// - Assigning the freshly-generated (initially unassigned) task to a user
//   is done via /kanban's TaskDetailModal (same component the calendar
//   page itself uses), since the generated task has no developmentStageId
//   and therefore starts in the backlog panel — this sidesteps needing the
//   calendar's own (possibly-overflowed) day cell to reach the edit form.
// - Active templates registered in the marker test are stopped afterward
//   so later case creates in this file are not contaminated.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import {
  expect,
  registerWorkspaceMember,
  test,
  workspaceScopedHeaders,
  type WorkspaceInfo,
  workspacePagePath,
} from "./fixtures";

// Backend URL for setup/teardown helpers. Mirrors events-removed.spec.ts;
// this project's compose publishes the API on BACKEND_PORT (see .env).
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

type ApiCase = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

// Soft-delete cases that would make week-lane assertions flaky on the
// shared dev DB (testing.md: not reset between runs):
// - open-ended (only startDate or only endDate): clip to every week from
//   their anchor to ±infinity in `buildWeekCaseLanes`
// - prior `e2e-cal-*` fixtures: accumulate on the same next-month weeks
// Uses the page's authenticated request + workspace header (task 10.1).
async function purgePollutingCalendarCases(request: APIRequestContext, workspaceId: string) {
  const response = await request.get(`${API_BASE_URL}/api/cases`, {
    headers: { "x-workspace-id": workspaceId },
  });
  expect(response.ok()).toBeTruthy();
  const cases = (await response.json()) as ApiCase[];
  for (const item of cases) {
    const openEnded = item.startDate === null || item.endDate === null;
    const e2eCalendarFixture = item.name.startsWith("e2e-cal-");
    if (!openEnded && !e2eCalendarFixture) continue;
    const del = await request.delete(`${API_BASE_URL}/api/cases/${item.id}`, {
      headers: await workspaceScopedHeaders(request, workspaceId),
    });
    expect([204, 404]).toContain(del.status());
  }
}

async function createUser(
  page: Page,
  request: APIRequestContext,
  workspace: WorkspaceInfo,
  name: string,
) {
  await registerWorkspaceMember(page, request, workspace.id, name);
}

type ApiTemplate = {
  id: string;
  title: string;
  isActive: boolean;
};

// Registers a case_start template (offset 0, as_is) via the create Modal so
// a later case create with startDate=today yields scheduledEndDate=today
// without holiday skip/shift.
async function registerCaseStartTemplate(
  page: Page,
  workspaceId: string,
  title: string,
  priorityLabel: "高" | "中" | "低",
) {
  await page.goto(workspacePagePath(workspaceId, "recurrence"));
  await page.getByRole("button", { name: "テンプレートを登録" }).click();
  const modal = page.locator(".recurrence-form-modal");
  await expect(modal).toBeVisible();
  await modal.getByLabel("テンプレート名").fill(title);
  await modal.getByLabel("優先度").selectOption({ label: priorityLabel });
  await modal.getByLabel("起点").selectOption({ label: "案件開始日" });
  await modal.getByLabel("オフセット日数").fill("0");
  await modal.getByLabel("非営業日に該当した場合の扱い").selectOption({ label: "そのまま登録" });
  await modal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator("tbody tr", { hasText: title })).toBeVisible();
}

async function stopTemplatesByTitle(
  request: APIRequestContext,
  workspaceId: string,
  titles: string[],
) {
  const response = await request.get(`${API_BASE_URL}/api/recurring-templates`, {
    headers: { "x-workspace-id": workspaceId },
  });
  expect(response.ok()).toBeTruthy();
  const templates = (await response.json()) as ApiTemplate[];
  const wanted = new Set(titles);
  for (const template of templates) {
    if (!wanted.has(template.title) || !template.isActive) continue;
    const stop = await request.post(`${API_BASE_URL}/api/recurring-templates/${template.id}/stop`, {
      headers: await workspaceScopedHeaders(request, workspaceId),
    });
    expect([204, 200, 404]).toContain(stop.status());
  }
}

// Assigns `userName` to the (currently unassigned, stage-less) task
// `taskTitle` via the kanban board's backlog panel + TaskDetailModal —
// the calendar page reuses this exact modal component, but this setup step
// avoids depending on the task's marker being reachable on the calendar's
// (potentially overflowed) day cell.
async function assignViaKanbanBacklog(
  page: Page,
  workspaceId: string,
  taskTitle: string,
  userName: string,
) {
  await page.goto(workspacePagePath(workspaceId, "kanban"));
  await page.getByRole("button", { name: /展開/ }).click();
  await page.locator(".card[data-task-id]", { hasText: taskTitle }).click();
  const modal = page.locator(".task-detail-modal");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "編集" }).click();
  await modal.getByLabel("担当者").selectOption({ label: userName });
  await modal.getByRole("button", { name: "保存" }).click();
  await expect(modal.getByRole("button", { name: "編集" })).toBeVisible();
  await modal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(modal).toBeHidden();
}

function monthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function monthHeading(page: Page): Locator {
  return page.locator("span.min-w-20.text-center.text-sm.font-medium.tabular-nums");
}

async function goToMonth(page: Page, year: number, month: number) {
  const target = monthLabel(year, month);
  for (let i = 0; i < 36; i++) {
    const label = await monthHeading(page).textContent();
    if (label === target) return;
    const match = label?.match(/^(\d+)年(\d+)月$/);
    if (!match) throw new Error(`unexpected calendar month label: ${label}`);
    const visibleYear = Number(match[1]);
    const visibleMonth = Number(match[2]);
    const diff = (year - visibleYear) * 12 + (month - visibleMonth);
    const prev = label ?? "";
    await page.getByRole("button", { name: diff > 0 ? "次月" : "前月" }).click();
    await expect(monthHeading(page)).not.toHaveText(prev);
  }
  throw new Error(`failed to reach ${target}`);
}

async function dayFootprint(cell: Locator): Promise<number> {
  const visibleMarkers = await cell.locator('[role="button"][aria-label$="の詳細を開く"]').count();
  const cellText = await cell.innerText();
  const overflowMatch = cellText.match(/他(\d+)(\+)?件/);
  if (!overflowMatch) return visibleMarkers;
  const shown = Number(overflowMatch[1]);
  return visibleMarkers + (overflowMatch[2] ? shown + 1 : shown);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// First Monday that falls inside `year`/`month` (1-indexed). Used so case
// overflow fixtures can occupy a single Sun–Sat week entirely within the
// displayed month without spilling into adjacent weeks/months.
function firstMondayInMonth(year: number, month: number): { year: number; month: number; day: number } {
  for (let day = 1; day <= 7; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 1) {
      return { year, month, day };
    }
  }
  throw new Error(`no Monday in the first week of ${year}-${month}`);
}

// Day-cell locator: visual refresh dropped `min-h-24`; cells are
// `min-w-0 overflow-hidden p-1.5` with a background class. Escape the
// dot in `p-1.5` so CSS does not treat `.5` as a separate class.
function dayCells(page: Page): Locator {
  return page.locator("div.min-w-0.overflow-hidden.p-1\\.5");
}

// Today's cell uses amber wash (research.md / cellBackgroundClass), not
// the previous primary-50 tint.
function todayCell(page: Page): Locator {
  return page.locator("div.bg-amber-50");
}

// Drives shared/DatePicker.vue via its real UI (same as cases.spec.ts).
async function setDateViaPicker(container: Locator, triggerName: string, iso: string) {
  const trigger = container.getByRole("button", { name: triggerName, exact: true });
  await trigger.click();
  const popover = container.getByRole("dialog", { name: `${triggerName}を選択` });
  await expect(popover).toBeVisible();

  const [yearPart, monthPart] = iso.split("-");
  const targetYear = Number(yearPart);
  const targetMonth = Number(monthPart);
  const monthLabelLocator = popover.locator("span.text-sm.font-medium.text-slate-900");
  for (let i = 0; i < 240; i++) {
    const label = await monthLabelLocator.textContent();
    const match = label?.match(/^(\d+)年(\d+)月$/);
    if (!match) throw new Error(`unexpected month label: ${label}`);
    const [, yearStr, monthStr] = match;
    const visibleYear = Number(yearStr);
    const visibleMonth = Number(monthStr);
    if (visibleYear === targetYear && visibleMonth === targetMonth) break;
    const diff = (targetYear - visibleYear) * 12 + (targetMonth - visibleMonth);
    await popover.getByRole("button", { name: diff > 0 ? "次の月" : "前の月", exact: true }).click();
  }

  await popover.getByRole("button", { name: iso, exact: true }).click();
  await popover.getByRole("button", { name: "決定", exact: true }).click();
  await expect(popover).toBeHidden();
}

// UI create that applies active templates when both dates are set (omit
// templateOperations → server full candidates). Missing dates approve Screen A.
async function createCaseApplyingTemplates(
  page: Page,
  workspaceId: string,
  name: string,
  opts: { startDate: string; endDate: string },
) {
  await page.goto(workspacePagePath(workspaceId, "cases"));
  await page.getByRole("button", { name: "案件を登録" }).click();
  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();
  await formModal.getByLabel("案件名").fill(name);
  await setDateViaPicker(formModal, "開始日", opts.startDate);
  await setDateViaPicker(formModal, "終了日", opts.endDate);
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(formModal).toBeHidden();
}

// Case-bar fixtures: no template apply (templateOperations: []) so active
// templates on the shared DB cannot inject scheduled tasks into bar tests.
async function createCaseFixture(
  request: APIRequestContext,
  workspaceId: string,
  name: string,
  opts: { startDate?: string; endDate?: string } = {},
) {
  const response = await request.post(`${API_BASE_URL}/api/cases`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: {
      name,
      ...(opts.startDate ? { startDate: opts.startDate } : {}),
      ...(opts.endDate ? { endDate: opts.endDate } : {}),
      templateOperations: [],
    },
  });
  expect(response.ok()).toBeTruthy();
}

test("期限日を持つタスクの表示・開発段階バッジ・担当者絞り込み・詳細モーダル (Requirements 1.1-1.3, 2.1-2.5, 5.1-5.3, 6.1)", async ({
  page,
  request,
  workspace,
}) => {
  test.setTimeout(90_000);
  const suffix = Date.now();
  const userAName = `e2e-cal-user-a-${suffix}`;
  const userBName = `e2e-cal-user-b-${suffix}`;
  const taskATitle = `e2e-cal-task-a-${suffix}`;
  const taskBTitle = `e2e-cal-task-b-${suffix}`;
  const noDateTaskTitle = `e2e-cal-nodate-${suffix}`;
  const seedCaseName = `e2e-cal-seed-${suffix}`;

  await createUser(page, request, workspace, userAName);
  await createUser(page, request, workspace, userBName);

  // Requirement 2.2: a task with no scheduledEndDate is created (via the
  // ordinary /tasks form, which has no scheduledEndDate field at all) and
  // must never appear on the calendar.
  await page.goto(workspacePagePath(workspace.id, "tasks"));
  await page.getByPlaceholder("タスク名").fill(noDateTaskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: noDateTaskTitle }).first()).toBeVisible();

  // Requirement 2.1/2.3/2.4 (+ recurrence-holidays-ux 1.2 / 3.4): two
  // case_start templates, then a case with both dates = today so the
  // server applies full candidates and instances land on today.
  // Priority is still set on the template (form requires it) but is no
  // longer asserted on the calendar marker after the visual refresh.
  const now = new Date();
  const today = isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  await registerCaseStartTemplate(page, workspace.id, taskATitle, "高");
  await registerCaseStartTemplate(page, workspace.id, taskBTitle, "低");
  await createCaseApplyingTemplates(page, workspace.id, seedCaseName, {
    startDate: today,
    endDate: today,
  });
  await stopTemplatesByTitle(page.request, workspace.id, [taskATitle, taskBTitle]);

  await assignViaKanbanBacklog(page, workspace.id, taskATitle, userAName);
  await assignViaKanbanBacklog(page, workspace.id, taskBTitle, userBName);

  await page.goto(workspacePagePath(workspace.id, "calendar"));
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  const currentLabel = monthLabel(now.getFullYear(), now.getMonth() + 1);

  // Requirement 1.1: current month is shown by default.
  await expect(monthHeading(page)).toHaveText(currentLabel);
  // Requirement 1.2: full weeks (multiple of 7 day-cells) are rendered.
  // The grid is behind `v-if="loaded"`, so wait for at least one cell
  // before counting -- `.count()` itself does not auto-wait like
  // `expect(locator)` does.
  await expect(dayCells(page).first()).toBeVisible();
  const cellCount = await dayCells(page).count();
  expect(cellCount).toBeGreaterThanOrEqual(28);
  expect(cellCount % 7).toBe(0);
  // Requirement 1.3: today's cell is visually distinguished (amber wash +
  // filled day number circle).
  await expect(todayCell(page)).toHaveCount(1);
  await expect(todayCell(page).locator("span.rounded-full.bg-primary-600")).toBeVisible();

  // Requirement 2.2: the dateless task never appears on the calendar.
  await expect(page.getByText(noDateTaskTitle)).toHaveCount(0);

  // Requirement 5.2: filtering by userA narrows to just taskA.
  await page.getByLabel("担当者で絞り込み").selectOption({ label: userAName });
  const markerA = page.getByRole("button", { name: `${taskATitle} の詳細を開く` });
  await expect(markerA).toBeVisible();
  await expect(page.getByRole("button", { name: `${taskBTitle} の詳細を開く` })).toHaveCount(0);
  // Requirement 2.3/2.4 (post visual refresh): development-stage badge is
  // shown; status/priority badges are gone. Freshly generated instances
  // have no stage → 「未設定」.
  await expect(markerA.getByText("未設定")).toBeVisible();
  await expect(markerA.getByText("未着手")).toHaveCount(0);
  await expect(markerA.getByText("高", { exact: true })).toHaveCount(0);

  // Requirement 5.2 (symmetric check): filtering by userB narrows to just
  // taskB, proving the filter narrows regardless of which assignee.
  await page.getByLabel("担当者で絞り込み").selectOption({ label: userBName });
  const markerB = page.getByRole("button", { name: `${taskBTitle} の詳細を開く` });
  await expect(markerB).toBeVisible();
  await expect(page.getByRole("button", { name: `${taskATitle} の詳細を開く` })).toHaveCount(0);

  // Requirement 6.1: selecting a task on the calendar opens its detail
  // modal with title/assignee. Done here (filter still narrowed to userB)
  // rather than after switching to "すべて" below — today's cell
  // accumulates markers across runs and can exceed the per-day overflow
  // budget (Requirement 2.5).
  await markerB.click();
  const taskModal = page.locator(".task-detail-modal");
  await expect(taskModal).toBeVisible();
  await expect(taskModal.getByText(taskBTitle)).toBeVisible();
  await expect(taskModal.getByText(`担当者: ${userBName}`)).toBeVisible();
  await taskModal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(taskModal).toBeHidden();

  // Requirement 5.1: "すべて" aggregates tasks across all assignees.
  // Sum footprints across every day cell (task markers live inside cells;
  // case bars live in the week overlay and are excluded). Do not pin to
  // the amber "today" cell: generated `scheduledEndDate` follows the API
  // host clock and can disagree with the browser's local `isToday`.
  async function gridTaskFootprint(): Promise<number> {
    const cells = dayCells(page);
    const n = await cells.count();
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += await dayFootprint(cells.nth(i));
    }
    return total;
  }
  const userBOnlyFootprint = await gridTaskFootprint();
  expect(userBOnlyFootprint).toBe(1);

  await page.getByLabel("担当者で絞り込み").selectOption({ label: "すべて" });
  await expect
    .poll(gridTaskFootprint, { message: "grid task footprint should grow once unfiltered" })
    .toBeGreaterThan(userBOnlyFootprint);
});

test("案件期間バー・片側日付・完了状態・詳細モーダル・月移動 (Requirements 1.1, 3.1-3.5, 4.1-4.3, 5.3, 6.2)", async ({
  page,
  request,
  workspace,
}) => {
  test.setTimeout(90_000);
  const api = page.request;
  await purgePollutingCalendarCases(api, workspace.id);

  const suffix = Date.now();
  const periodCaseName = `e2e-cal-case-period-${suffix}`;
  const pointCaseName = `e2e-cal-case-point-${suffix}`;
  const noDateCaseName = `e2e-cal-case-nodate-${suffix}`;
  const filterUserName = `e2e-cal-case-filter-user-${suffix}`;

  await createUser(page, request, workspace, filterUserName);

  const now = new Date();
  const currentLabel = monthLabel(now.getFullYear(), now.getMonth() + 1);
  const { year: nmYear, month: nmMonth } = nextMonth(now.getFullYear(), now.getMonth() + 1);
  const nextLabel = monthLabel(nmYear, nmMonth);

  // Span Mon–Fri of the first in-month Monday so both ends land in the
  // same week (one week-lane bar).
  const monday = firstMondayInMonth(nmYear, nmMonth);
  const periodStart = isoDate(monday.year, monday.month, monday.day);
  const periodEnd = isoDate(monday.year, monday.month, monday.day + 4);
  const pointDate = isoDate(nmYear, nmMonth, 20);

  // Requirement 3.1: a case with both startDate/endDate set becomes a
  // period bar.
  await createCaseFixture(api, workspace.id, periodCaseName, { startDate: periodStart, endDate: periodEnd });

  // Requirement 3.2: a case with only one of startDate/endDate set becomes
  // an open-ended lane bar (fade + ›/‹) anchored on that date. Deleted at
  // the end of this test so it does not re-pollute future weeks.
  await createCaseFixture(api, workspace.id, pointCaseName, { startDate: pointDate });

  // Requirement 3.3: a case with neither date set never appears on the
  // calendar.
  await createCaseFixture(api, workspace.id, noDateCaseName);

  await page.goto(workspacePagePath(workspace.id, "calendar"));
  await expect(monthHeading(page)).toHaveText(currentLabel);

  // Requirement 4.1: moving to next month updates the displayed month.
  await page.getByRole("button", { name: "次月" }).click();
  await expect(monthHeading(page)).toHaveText(nextLabel);

  // Requirement 3.3: the no-date case is never rendered.
  await expect(page.getByText(noDateCaseName)).toHaveCount(0);

  // Requirement 3.1/3.4: the period case renders as a single week-lane bar
  // spanning its Mon–Fri range (same week by construction above).
  const periodBars = page.getByRole("button", { name: `${periodCaseName} の詳細を開く` });
  await expect(periodBars).toHaveCount(1);
  await expect(periodBars).toHaveClass(/rounded-l/);
  await expect(periodBars).toHaveClass(/rounded-r/);
  await expect(periodBars).toContainText(periodCaseName);

  // Requirement 3.2: the start-only case renders an open-ended bar
  // (openEnd → ›). `buildWeekCaseLanes` continues open-ended ranges into
  // every later week, so the same case can appear more than once in the
  // month grid — assert the lead segment, not an exact count of 1.
  const pointBar = page.getByRole("button", { name: `${pointCaseName} の詳細を開く` });
  await expect(pointBar.first()).toBeVisible();
  await expect(pointBar.first()).toContainText(pointCaseName);
  await expect(pointBar.first()).toContainText("›");

  // Requirement 5.3: case bars are unaffected by the assignee filter.
  await page.getByLabel("担当者で絞り込み").selectOption({ label: filterUserName });
  await expect(periodBars).toHaveCount(1);
  await expect(pointBar.first()).toBeVisible();
  await page.getByLabel("担当者で絞り込み").selectOption({ label: "すべて" });

  // Requirement 6.2: selecting a case period bar opens its detail modal
  // with name/period/completion state.
  await periodBars.click();
  const caseModal = page.locator(".case-detail-modal");
  await expect(caseModal).toBeVisible();
  await expect(caseModal.getByText(periodCaseName)).toBeVisible();
  await expect(caseModal.getByText(periodStart)).toBeVisible();
  await expect(caseModal.getByText(periodEnd)).toBeVisible();

  // Requirement 3.5: marking the case completed changes the bar's visual
  // treatment (line-through + muted styling) once back on the calendar.
  await caseModal.getByRole("button", { name: "編集" }).click();
  await caseModal.getByRole("switch", { name: "この案件を完了にする" }).click();
  await caseModal.getByRole("button", { name: "保存" }).click();
  await expect(caseModal.getByText("完了", { exact: true })).toBeVisible();
  await caseModal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(caseModal).toBeHidden();

  await expect(periodBars).toHaveClass(/line-through/);

  // Requirement 4.2: moving to the previous month returns to the original
  // month.
  await page.getByRole("button", { name: "前月" }).click();
  await expect(monthHeading(page)).toHaveText(currentLabel);

  // Requirement 4.3: "今月" returns to the current month from anywhere.
  await page.getByRole("button", { name: "次月" }).click();
  await expect(monthHeading(page)).toHaveText(nextLabel);
  await page.getByRole("button", { name: "今月" }).click();
  await expect(monthHeading(page)).toHaveText(currentLabel);

  // Soft-delete the open-ended point case so later tests in this file keep
  // a clean lane budget (see purgePollutingCalendarCases).
  const listed = (await (
    await api.get(`${API_BASE_URL}/api/cases`, { headers: { "x-workspace-id": workspace.id } })
  ).json()) as ApiCase[];
  const point = listed.find((item) => item.name === pointCaseName);
  if (point) {
    await api.delete(`${API_BASE_URL}/api/cases/${point.id}`, {
      headers: await workspaceScopedHeaders(api, workspace.id),
    });
  }
});

test("案件が3件を超える週の「他N件」から一覧ポップアップ経由で案件詳細へ (Requirement 3.6)", async ({
  page,
  workspace,
}) => {
  test.setTimeout(90_000);
  const api = page.request;
  await purgePollutingCalendarCases(api, workspace.id);

  const suffix = Date.now();
  const now = new Date();
  const { year: targetYear, month: targetMonth } = nextMonth(now.getFullYear(), now.getMonth() + 1);
  // Second Monday week: keeps this scenario off the first-Monday band used
  // by the period-bar test when both run in the same suite.
  const monday = firstMondayInMonth(targetYear, targetMonth);
  const weekMondayDay = monday.day + 7;
  const rangeStart = isoDate(targetYear, targetMonth, weekMondayDay);
  const rangeEnd = isoDate(targetYear, targetMonth, weekMondayDay + 4);

  // Four fully-overlapping cases in the same week: with maxLanes=3 the
  // chip-aware second pass keeps 2 bars and overflows the rest → 「他2件」.
  const caseNames = [0, 1, 2, 3].map((i) => `e2e-cal-overflow-${i}-${suffix}`);
  for (const name of caseNames) {
    await createCaseFixture(api, workspace.id, name, { startDate: rangeStart, endDate: rangeEnd });
  }

  await page.goto(workspacePagePath(workspace.id, "calendar"));
  await goToMonth(page, targetYear, targetMonth);

  const overflowChip = page.getByRole("button", { name: /\d+件の案件を一覧表示/ });
  await expect(overflowChip).toHaveCount(1);
  await expect(overflowChip).toHaveText(/他2件/);

  await overflowChip.click();
  const overflowDialog = page.getByRole("dialog").filter({ hasText: caseNames[0]! });
  await expect(overflowDialog).toBeVisible();
  await expect(overflowDialog).toHaveAttribute("aria-label", /\d+\/\d+\s*〜\s*\d+\/\d+/);

  // Full-week list (lanes + overflow): every case created above must appear.
  for (const name of caseNames) {
    await expect(overflowDialog.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  }

  const pickName = caseNames[3]!;
  await overflowDialog.getByRole("button", { name: new RegExp(pickName) }).click();
  await expect(overflowDialog).toBeHidden();

  const caseModal = page.locator(".case-detail-modal");
  await expect(caseModal).toBeVisible();
  await expect(caseModal.getByText(pickName)).toBeVisible();
  await caseModal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(caseModal).toBeHidden();
});

test("案件バー表示切替スイッチでバーの表示・非表示が切り替わる (Requirements 9.1, 9.2)", async ({
  page,
  workspace,
}) => {
  test.setTimeout(60_000);
  const api = page.request;
  await purgePollutingCalendarCases(api, workspace.id);

  const suffix = Date.now();
  const caseName = `e2e-cal-toggle-${suffix}`;
  const now = new Date();
  const { year: targetYear, month: targetMonth } = nextMonth(now.getFullYear(), now.getMonth() + 1);
  // Third Monday week — distinct from period (1st) and overflow (2nd).
  const monday = firstMondayInMonth(targetYear, targetMonth);
  const weekMondayDay = monday.day + 14;
  const rangeStart = isoDate(targetYear, targetMonth, weekMondayDay);
  const rangeEnd = isoDate(targetYear, targetMonth, weekMondayDay + 2);

  await createCaseFixture(api, workspace.id, caseName, { startDate: rangeStart, endDate: rangeEnd });

  await page.goto(workspacePagePath(workspace.id, "calendar"));
  await goToMonth(page, targetYear, targetMonth);

  const bar = page.getByRole("button", { name: `${caseName} の詳細を開く` });
  const toggle = page.getByRole("switch", { name: "案件バーを表示" });

  // Requirement 9.1: bars are shown initially.
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(bar).toBeVisible();

  // Requirement 9.2: toggle off hides bars; toggle on restores them.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(bar).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(bar).toBeVisible();
});
