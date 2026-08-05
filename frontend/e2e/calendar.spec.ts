// E2E: calendar screen's main flows (task 6.1, design.md Testing Strategy
// "E2E Tests", Requirements 1.1-1.3, 2.1-2.5, 3.1-3.5, 4.1-4.3, 5.1-5.3,
// 6.1-6.2).
//
// Test-data setup notes (see this task's boundary in tasks.md 6.1 and
// .kiro/steering/testing.md):
// - Cases: `startDate`/`endDate` are fully settable through the real
//   CaseFormModal UI (/cases), so case period bars are driven end-to-end
//   through actual form interaction, same as cases.spec.ts.
// - Tasks: there is no UI path to set an arbitrary task's `scheduledDate`
//   directly (task.routes.ts's Zod create/update schemas don't accept it).
//   The only legitimate UI path that produces a task with a real
//   `scheduledDate` is the recurring-task-template flow (/recurrence):
//   registering a `fixed_interval` template and clicking "今すぐ生成"
//   (`POST /api/recurring-templates/generate-due` with no explicit `asOf`,
//   which the backend defaults to `new Date()`) creates a real Task row
//   whose `scheduledDate` is *today* (the template's own `createdAt`, which
//   is always included as the rule's first occurrence). This is a real,
//   already-shipped feature (recurrence spec) exercised exactly as a user
//   would, not a private API call or DB write.
// - Because generated instances land with today's date, and the dev DB
//   accumulates data across runs (testing.md), today's day-cell could in
//   principle already hold >= 3 unrelated tasks and push new ones into the
//   "+N件" overflow (index.helpers.ts's MAX_VISIBLE_TASK_MARKERS_PER_DAY).
//   To keep marker-visibility assertions robust against that, tasks used
//   for direct marker/badge/modal assertions are always checked through
//   the assignee filter narrowed to a *brand-new* user created earlier in
//   the same test — a user that has never been assigned any pre-existing
//   task, so its filtered result set is guaranteed to contain only the
//   task(s) this test just created and assigned (confirmed necessary
//   during this task's own verification run: today's cell already held
//   several tasks left over from earlier manual/E2E verification of this
//   same feature, which pushed a directly-checked marker into the "+N件"
//   overflow). Requirement 5.1 ("すべて" aggregates all assignees) is
//   proven via a day-cell footprint count (visible markers + overflow
//   number) compared against the known-exact single-assignee baseline,
//   not via direct visibility of specific task titles in the unfiltered
//   view, for the same reason.
// - Assigning the freshly-generated (initially unassigned) task to a user
//   is done via /kanban's TaskDetailModal (same component the calendar
//   page itself uses), since the generated task has no developmentStageId
//   and therefore starts in the backlog panel — this sidesteps needing the
//   calendar's own (possibly-overflowed) day cell to reach the edit form.
import { expect, test, type Page } from "@playwright/test";

async function createUser(page: Page, name: string) {
  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(name);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: name })).toBeVisible();
}

// Registers a fixed_interval recurring template (daily, non_business_day
// policy left at its "as_is" default so today's scheduled date is never
// skipped/shifted regardless of weekday/holiday status).
async function registerDailyTemplate(page: Page, title: string, priorityLabel: "高" | "中" | "低") {
  await page.goto("/recurrence");
  const form = page.locator("form").first();
  await form.getByPlaceholder("テンプレート名").fill(title);
  await form.locator("select").nth(0).selectOption({ label: priorityLabel });
  // kind (nth(1)) stays at its "固定間隔" default.
  await form.locator("select").nth(2).selectOption({ label: "日" });
  await form.getByRole("button", { name: "テンプレート登録" }).click();
  await expect(page.locator("tbody tr", { hasText: title })).toBeVisible();
}

async function generateDueInstancesNow(page: Page) {
  await page.getByRole("button", { name: "今すぐ生成" }).click();
  await expect(page.getByText(/件のタスクを生成しました/)).toBeVisible();
}

// Assigns `userName` to the (currently unassigned, stage-less) task
// `taskTitle` via the kanban board's backlog panel + TaskDetailModal —
// the calendar page reuses this exact modal component, but this setup step
// avoids depending on the task's marker being reachable on the calendar's
// (potentially overflowed) day cell.
async function assignViaKanbanBacklog(page: Page, taskTitle: string, userName: string) {
  await page.goto("/kanban");
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

// Drives shared/DatePicker.vue via its real UI (same as cases.spec.ts).
async function setDateViaPicker(container: import("@playwright/test").Locator, triggerName: string, isoDate: string) {
  const trigger = container.getByRole("button", { name: triggerName, exact: true });
  await trigger.click();
  const popover = container.getByRole("dialog", { name: `${triggerName}を選択` });
  await expect(popover).toBeVisible();

  const [yearPart, monthPart] = isoDate.split("-");
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

  await popover.getByRole("button", { name: isoDate, exact: true }).click();
  await popover.getByRole("button", { name: "決定", exact: true }).click();
  await expect(popover).toBeHidden();
}

test("期限日を持つタスクの表示・状態/優先度・担当者絞り込み・詳細モーダル (Requirements 1.1-1.3, 2.1-2.5, 5.1-5.3, 6.1)", async ({ page }) => {
  const suffix = Date.now();
  const userAName = `e2e-cal-user-a-${suffix}`;
  const userBName = `e2e-cal-user-b-${suffix}`;
  const taskATitle = `e2e-cal-task-a-${suffix}`;
  const taskBTitle = `e2e-cal-task-b-${suffix}`;
  const noDateTaskTitle = `e2e-cal-nodate-${suffix}`;

  await createUser(page, userAName);
  await createUser(page, userBName);

  // Requirement 2.2: a task with no scheduledDate is created (via the
  // ordinary /tasks form, which has no scheduledDate field at all) and
  // must never appear on the calendar.
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(noDateTaskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: noDateTaskTitle }).first()).toBeVisible();

  // Requirement 2.1/2.3/2.4 test data: two recurring templates, generated
  // "now" so both instances land with scheduledDate = today.
  await registerDailyTemplate(page, taskATitle, "高");
  await registerDailyTemplate(page, taskBTitle, "低");
  await generateDueInstancesNow(page);

  await assignViaKanbanBacklog(page, taskATitle, userAName);
  await assignViaKanbanBacklog(page, taskBTitle, userBName);

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "カレンダー" })).toBeVisible();

  const now = new Date();
  const currentLabel = monthLabel(now.getFullYear(), now.getMonth() + 1);

  // Requirement 1.1: current month is shown by default.
  await expect(page.locator("span.tabular-nums")).toHaveText(currentLabel);
  // Requirement 1.2: full weeks (multiple of 7 day-cells) are rendered.
  // The grid is behind `v-if="loaded"`, so wait for at least one cell
  // before counting -- `.count()` itself does not auto-wait like
  // `expect(locator)` does.
  await expect(page.locator("div.min-h-24").first()).toBeVisible();
  const cellCount = await page.locator("div.min-h-24").count();
  expect(cellCount).toBeGreaterThanOrEqual(28);
  expect(cellCount % 7).toBe(0);
  // Requirement 1.3: today's cell is visually distinguished.
  await expect(page.locator("div.bg-primary-50")).toHaveCount(1);

  // Requirement 2.2: the dateless task never appears on the calendar.
  await expect(page.getByText(noDateTaskTitle)).toHaveCount(0);

  // Requirement 5.2: filtering by userA narrows to just taskA.
  await page.getByLabel("担当者で絞り込み").selectOption({ label: userAName });
  const markerA = page.getByRole("button", { name: `${taskATitle} の詳細を開く` });
  await expect(markerA).toBeVisible();
  await expect(page.getByRole("button", { name: `${taskBTitle} の詳細を開く` })).toHaveCount(0);
  // Requirement 2.3/2.4: status ("未着手", a freshly generated instance
  // starts not_started) and priority ("高", as registered) badges are
  // shown on the marker.
  await expect(markerA.getByText("未着手")).toBeVisible();
  await expect(markerA.getByText("高", { exact: true })).toBeVisible();

  // Requirement 5.2 (symmetric check): filtering by userB narrows to just
  // taskB, proving the filter narrows regardless of which assignee.
  await page.getByLabel("担当者で絞り込み").selectOption({ label: userBName });
  const markerB = page.getByRole("button", { name: `${taskBTitle} の詳細を開く` });
  await expect(markerB).toBeVisible();
  await expect(page.getByRole("button", { name: `${taskATitle} の詳細を開く` })).toHaveCount(0);

  // Requirement 6.1: selecting a task on the calendar opens its detail
  // modal with title/status/priority/assignee. Done here (filter still
  // narrowed to userB, guaranteed a single, un-overflowed marker for
  // today) rather than after switching to "すべて" below, since today's
  // day-cell accumulates task markers across every past run of this exact
  // scenario (scheduledDate is always "today" -- see file header comment)
  // and can already exceed the 3-marker overflow cap (Requirement 2.5)
  // before this test even runs, which would make a specific marker
  // undependably clickable in the unfiltered view.
  await markerB.click();
  const taskModal = page.locator(".task-detail-modal");
  await expect(taskModal).toBeVisible();
  await expect(taskModal.getByText(taskBTitle)).toBeVisible();
  await expect(taskModal.getByText(`担当者: ${userBName}`)).toBeVisible();
  await taskModal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(taskModal).toBeHidden();

  // Requirement 5.1: "すべて" aggregates tasks across all assignees, not
  // just one. Proven via a footprint count (visible markers + overflow
  // count, both scoped to today's cell) rather than direct visibility of
  // taskA/taskB specifically: today's cell is shared, ever-accumulating
  // state (every prior run of this test -- or any other manual/automated
  // verification -- adds more same-day tasks, and Requirement 2.5's
  // 3-marker cap means individual markers can silently fall into "+N件"
  // overflow independent of anything this test does). The single-assignee
  // filter above is immune to that (a brand-new user has exactly one
  // task, always under the cap), so comparing "すべて"'s total footprint
  // against that known-exact baseline robustly proves aggregation without
  // depending on which specific tasks happen to be in the visible top 3
  // today.
  async function todayFootprint(): Promise<number> {
    const cell = page.locator("div.bg-primary-50");
    const visibleMarkers = await cell.locator("div.bg-slate-50.ring-slate-100").count();
    const cellText = await cell.innerText();
    const overflowMatch = cellText.match(/\+(\d+)件/);
    return visibleMarkers + (overflowMatch ? Number(overflowMatch[1]) : 0);
  }
  const userBOnlyFootprint = await todayFootprint();
  expect(userBOnlyFootprint).toBe(1);

  await page.getByLabel("担当者で絞り込み").selectOption({ label: "すべて" });
  await expect.poll(todayFootprint, { message: "today's footprint should grow once unfiltered" }).toBeGreaterThan(
    userBOnlyFootprint,
  );
});

test("案件期間バー・点マーカー・完了状態・詳細モーダル・月移動 (Requirements 1.1, 3.1-3.5, 4.1-4.3, 5.3, 6.2)", async ({ page }) => {
  const suffix = Date.now();
  const periodCaseName = `e2e-cal-case-period-${suffix}`;
  const pointCaseName = `e2e-cal-case-point-${suffix}`;
  const noDateCaseName = `e2e-cal-case-nodate-${suffix}`;
  const filterUserName = `e2e-cal-case-filter-user-${suffix}`;

  await createUser(page, filterUserName);

  const now = new Date();
  const { year: nmYear, month: nmMonth } = nextMonth(now.getFullYear(), now.getMonth() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const periodStart = `${nmYear}-${pad(nmMonth)}-05`;
  const periodEnd = `${nmYear}-${pad(nmMonth)}-09`;
  const pointDate = `${nmYear}-${pad(nmMonth)}-20`;

  // Requirement 3.1: a case with both startDate/endDate set becomes a
  // period bar.
  await page.goto("/cases");
  await page.getByRole("button", { name: "案件を登録" }).click();
  let formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();
  await formModal.getByLabel("案件名").fill(periodCaseName);
  await setDateViaPicker(formModal, "開始日", periodStart);
  await setDateViaPicker(formModal, "終了日", periodEnd);
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(formModal).toBeHidden();

  // Requirement 3.2: a case with only one of startDate/endDate set becomes
  // a point marker on that single day.
  await page.getByRole("button", { name: "案件を登録" }).click();
  formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();
  await formModal.getByLabel("案件名").fill(pointCaseName);
  await setDateViaPicker(formModal, "開始日", pointDate);
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(formModal).toBeHidden();

  // Requirement 3.3: a case with neither date set never appears on the
  // calendar.
  await page.getByRole("button", { name: "案件を登録" }).click();
  formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();
  await formModal.getByLabel("案件名").fill(noDateCaseName);
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(formModal).toBeHidden();

  await page.goto("/calendar");
  const currentLabel = monthLabel(now.getFullYear(), now.getMonth() + 1);
  const targetLabel = monthLabel(nmYear, nmMonth);
  await expect(page.locator("span.tabular-nums")).toHaveText(currentLabel);

  // Requirement 4.1: moving to next month updates the displayed month.
  await page.getByRole("button", { name: "次月" }).click();
  await expect(page.locator("span.tabular-nums")).toHaveText(targetLabel);

  // Requirement 3.3: the no-date case is never rendered, in this month or
  // any other.
  await expect(page.getByText(noDateCaseName)).toHaveCount(0);

  // Requirement 3.1/3.4: the period case renders as a bar across its
  // 5-day range (05..09 inclusive) within the displayed month only.
  const periodSegments = page.getByRole("button", { name: `${periodCaseName} の詳細を開く` });
  await expect(periodSegments).toHaveCount(5);
  await expect(periodSegments.first()).toHaveClass(/rounded-l/);
  await expect(periodSegments.last()).toHaveClass(/rounded-r/);
  // Only the start/single segment renders the case name as visible text.
  await expect(periodSegments.first()).toContainText(periodCaseName);

  // Requirement 3.2: the point case renders exactly one marker.
  const pointSegment = page.getByRole("button", { name: `${pointCaseName} の詳細を開く` });
  await expect(pointSegment).toHaveCount(1);
  await expect(pointSegment).toContainText(pointCaseName);

  // Requirement 5.3: case bars are unaffected by the assignee filter (a
  // filter selecting a user with zero assigned tasks must not hide case
  // bars, since cases have no assignee field at all).
  await page.getByLabel("担当者で絞り込み").selectOption({ label: filterUserName });
  await expect(periodSegments).toHaveCount(5);
  await expect(pointSegment).toHaveCount(1);
  await page.getByLabel("担当者で絞り込み").selectOption({ label: "すべて" });

  // Requirement 6.2: selecting a case period bar opens its detail modal
  // with name/period/completion state.
  await periodSegments.first().click();
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

  await expect(periodSegments.first()).toHaveClass(/line-through/);

  // Requirement 4.2: moving to the previous month returns to the original
  // month.
  await page.getByRole("button", { name: "前月" }).click();
  await expect(page.locator("span.tabular-nums")).toHaveText(currentLabel);

  // Requirement 4.3: "今月" returns to the current month from anywhere.
  await page.getByRole("button", { name: "次月" }).click();
  await expect(page.locator("span.tabular-nums")).toHaveText(targetLabel);
  await page.getByRole("button", { name: "今月" }).click();
  await expect(page.locator("span.tabular-nums")).toHaveText(currentLabel);
});
