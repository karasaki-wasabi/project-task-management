// E2E: case registration via popup (incl. unassigned-task association),
// name search, status-chip filtering, and overdue display/removal (task
// 9.2, design.md Testing Strategy "E2E", Requirements 2.1, 2.2, 3.1-3.3,
// 6.1, 6.3, 7.1-7.3). Requires the backend (+MySQL) and frontend to already
// be running (`docker compose up`); see playwright.config.ts.
//
// Task setup for unassigned-task selection goes through the /tasks page's
// own registration form (same convention as kanban.spec.ts/
// kanban-tray-reassign.spec.ts: no direct API seeding helper exists in this
// e2e/ directory, so UI-driven setup is the established pattern here) — a
// task created without a caseId query param is unassigned by construction
// (tasks/index.vue's createTask() only sets caseId when the page's own
// caseId ref is populated from the route query).
import { expect, test } from "./fixtures";

// Drives shared/DatePicker.vue (task 11.2/14.1) to an exact date via its
// real UI (month nav + day-cell click + 決定) — no bypassing the picker.
// `container` is the form/modal locator scoping the trigger button whose
// accessible name is `triggerName` (e.g. "開始日"/"終了日").
async function setDateViaPicker(
  container: import("@playwright/test").Locator,
  triggerName: string,
  isoDate: string,
) {
  const trigger = container.getByRole("button", { name: triggerName, exact: true });
  await trigger.click();
  const popover = container.getByRole("dialog", { name: `${triggerName}を選択` });
  await expect(popover).toBeVisible();

  const [yearPart, monthPart] = isoDate.split("-");
  const targetYear = Number(yearPart);
  const targetMonth = Number(monthPart);
  const monthLabel = popover.locator("span.text-sm.font-medium.text-slate-900");
  for (let i = 0; i < 240; i++) {
    const label = await monthLabel.textContent();
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

async function createUnassignedTask(page: import("@playwright/test").Page, title: string) {
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(title);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: title }).first()).toBeVisible();
}

// CaseFormModal opens CaseTemplateApplyConfirm (Screen A) when start and/or
// end date is unset; approve with 「作成する」 to finish create.
async function approveMissingDatesConfirm(page: import("@playwright/test").Page) {
  const confirm = page.getByRole("dialog", { name: "案件を作成しますか?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(confirm).toBeHidden();
}

test("案件を登録すると進捗が反映され、名称検索とステータスチップで絞り込める (Requirements 2.1, 2.2, 3.1-3.3, 7.1-7.3)", async ({
  page,
}) => {
  const suffix = Date.now();
  const taskATitle = `e2e-case-task-a-${suffix}`;
  const taskBTitle = `e2e-case-task-b-${suffix}`;
  const caseName = `e2e-case-${suffix}`;

  await createUnassignedTask(page, taskATitle);
  await createUnassignedTask(page, taskBTitle);

  await page.goto("/cases");
  await page.getByRole("button", { name: "案件を登録" }).click();

  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();

  await formModal.getByLabel("案件名").fill(caseName);
  await setDateViaPicker(formModal, "開始日", "2034-06-01");
  await setDateViaPicker(formModal, "終了日", "2034-06-30");

  const rowA = formModal.locator(".task-row", { hasText: taskATitle });
  const rowB = formModal.locator(".task-row", { hasText: taskBTitle });
  await expect(rowA).toBeVisible();
  await expect(rowB).toBeVisible();

  // Select both unassigned tasks, but mark only taskA as required
  // (Requirement 3.3: the required toggle is only meaningful/visible once
  // a row is selected).
  await rowA.getByRole("switch", { name: `${taskATitle} を選択` }).click();
  await rowB.getByRole("switch", { name: `${taskBTitle} を選択` }).click();
  await rowA.getByRole("switch", { name: `${taskATitle} を必須タスクにする` }).click();

  await formModal.getByRole("button", { name: "登録", exact: true }).click();

  // The modal auto-closes once every per-task association succeeds
  // (CaseFormModal.vue's `submit()`/`runAssociations()`) — waiting for it
  // to disappear proves both `updateTask` calls succeeded, not just the
  // `createCase` POST.
  await expect(formModal).toBeHidden();

  const caseRow = page.locator("tbody tr", { hasText: caseName });
  await expect(caseRow).toBeVisible();
  // taskA is the only required task and is still not_started, so
  // requiredCompleted=0/requiredTotal=1 (Requirement 2.3-2.5).
  await expect(caseRow).toContainText("0 / 1");
  await expect(caseRow.getByText("進行中")).toBeVisible();

  // Name search (Requirement 7.3): a genuine substring of the case name
  // filters the list down to it; a string that matches nothing shows the
  // "no results" empty state instead of leaving stale rows visible.
  const searchBox = page.getByPlaceholder("案件名で絞り込み");
  await searchBox.fill(caseName.slice(0, caseName.length - 4));
  await expect(caseRow).toBeVisible();

  await searchBox.fill(`no-such-case-${suffix}`);
  await expect(caseRow).not.toBeVisible();
  await expect(page.getByText("条件に一致する案件がありません")).toBeVisible();

  await searchBox.fill("");

  // Status chip filtering (Requirements 7.1, 7.2): the freshly-created case
  // is not completed, so it shows under すべて/進行中 but not under 完了.
  await page.getByRole("button", { name: /^進行中/ }).click();
  await expect(caseRow).toBeVisible();

  await page.getByRole("button", { name: /^完了/ }).click();
  await expect(caseRow).not.toBeVisible();

  await page.getByRole("button", { name: /^すべて/ }).click();
  await expect(caseRow).toBeVisible();
});

test("終了日超過かつ必須タスク未完了の案件は期限超過表示され、完了にすると表示が消える (Requirements 6.1, 6.3, 7.1, 7.2)", async ({
  page,
}) => {
  const suffix = Date.now();
  const overdueTaskTitle = `e2e-case-overdue-task-${suffix}`;
  const overdueCaseName = `e2e-case-overdue-${suffix}`;

  await createUnassignedTask(page, overdueTaskTitle);

  await page.goto("/cases");
  await page.getByRole("button", { name: "案件を登録" }).click();

  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();

  await formModal.getByLabel("案件名").fill(overdueCaseName);
  // Past end date + an incomplete required task is what CaseService's
  // `getProgress` needs to set isOverdueWithIncomplete=true (design.md:
  // "isOverdueWithIncomplete = !isCompleted && endDate < now &&
  // requiredIncomplete > 0"). No startDate needed for this scenario.
  await setDateViaPicker(formModal, "終了日", "2020-01-02");

  const overdueRow = formModal.locator(".task-row", { hasText: overdueTaskTitle });
  await expect(overdueRow).toBeVisible();
  await overdueRow.getByRole("switch", { name: `${overdueTaskTitle} を選択` }).click();
  await overdueRow.getByRole("switch", { name: `${overdueTaskTitle} を必須タスクにする` }).click();

  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await approveMissingDatesConfirm(page);
  await expect(formModal).toBeHidden();

  const caseRow = page.locator("tbody tr", { hasText: overdueCaseName });
  await expect(caseRow).toBeVisible();
  await expect(caseRow.getByText("期限超過")).toBeVisible();

  await page.getByRole("button", { name: /^期限超過/ }).click();
  await expect(caseRow).toBeVisible();

  await page.getByRole("button", { name: /^完了/ }).click();
  await expect(caseRow).not.toBeVisible();

  // Reset to すべて before interacting with the row again — it's hidden
  // under the still-active 完了 chip filter.
  await page.getByRole("button", { name: /^すべて/ }).click();
  await expect(caseRow).toBeVisible();

  await caseRow.click();
  const detailModal = page.locator(".case-detail-modal");
  await expect(detailModal).toBeVisible();
  await expect(detailModal.getByText("期限超過")).toBeVisible();

  await detailModal.getByRole("button", { name: "編集" }).click();
  await detailModal.getByRole("switch", { name: "この案件を完了にする" }).click();
  await detailModal.getByRole("button", { name: "保存" }).click();

  // Save returns to view mode in place (CaseDetailModal.vue: no `close`
  // emit on save) — the badge should now read 完了, with 期限超過 gone even
  // though the end date is still in the past (Requirement 6.2's rule that a
  // manually-completed case is never overdue).
  await expect(detailModal.getByText("完了", { exact: true })).toBeVisible();
  await expect(detailModal.getByText("期限超過")).not.toBeVisible();

  // Two elements share the accessible name "閉じる": the header X button
  // (aria-label) and the view-mode actions' text button — the latter is
  // last in DOM order.
  await detailModal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(detailModal).toBeHidden();

  await expect(caseRow.getByText("完了", { exact: true })).toBeVisible();
  await expect(caseRow.getByText("期限超過")).not.toBeVisible();

  await page.getByRole("button", { name: /^期限超過/ }).click();
  await expect(caseRow).not.toBeVisible();

  await page.getByRole("button", { name: /^完了/ }).click();
  await expect(caseRow).toBeVisible();
});

// Task 15.2 (design.md Testing Strategy "E2E", Requirements 2.4, 10.1, 10.3,
// 10.4, 10.5, 10.6). Exercises task 14.1's DatePicker integration into
// CaseFormModal end-to-end in a real browser for the first time.
//
// This scenario runs before the "no dates" registration scenario below on
// purpose: it cancels out of the form without ever submitting, so it never
// leaves a case with a null endDate behind. The registration scenario does
// create such a case, which (see that test's comment) currently crashes
// cases/index.vue's row rendering for the rest of the suite — keeping this
// non-mutating scenario first means it isn't collateral damage of that bug.
test("DatePickerのクイック選択・カレンダー選択・決定・キャンセル・クリアが入力欄に正しく反映される (Requirements 10.1, 10.3, 10.4, 10.5, 10.6)", async ({
  page,
}) => {
  await page.goto("/cases");
  await page.getByRole("button", { name: "案件を登録" }).click();

  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();

  const startDateTrigger = formModal.getByRole("button", { name: "開始日", exact: true });
  const popover = formModal.getByRole("dialog", { name: "開始日を選択" });

  await expect(startDateTrigger).toHaveText("未設定");

  // Open the picker and pick a quick-select chip. The header above the
  // chips reflects the draft immediately (Requirement 10.3), but the
  // trigger button behind the popover must NOT change until 決定.
  await startDateTrigger.click();
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "今日", exact: true }).click();
  await expect(startDateTrigger).toHaveText("未設定");

  await popover.getByRole("button", { name: "決定", exact: true }).click();
  await expect(popover).toBeHidden();
  const committedValue = await startDateTrigger.textContent();
  expect(committedValue).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);

  // Reopen, pick a different date via the calendar grid (the grid's first
  // cell is always outside the current month, so it's guaranteed distinct
  // from 今日), then キャンセル — the trigger must retain the PREVIOUSLY
  // committed value, not the discarded draft (Requirement 10.5).
  await startDateTrigger.click();
  await expect(popover).toBeVisible();
  await popover.locator('table[role="grid"] button').first().click();
  await expect(startDateTrigger).toHaveText(committedValue!);
  await popover.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(popover).toBeHidden();
  await expect(startDateTrigger).toHaveText(committedValue!);

  // Reopen, pick a date via the calendar grid again, then クリア — クリア
  // only resets the draft (the popover stays open and the trigger keeps
  // showing the previously committed value until 決定 is actually clicked;
  // Requirement 10.6).
  await startDateTrigger.click();
  await expect(popover).toBeVisible();
  await popover.locator('table[role="grid"] button').last().click();
  await popover.getByRole("button", { name: "クリア", exact: true }).click();
  await expect(popover).toBeVisible();
  await expect(startDateTrigger).toHaveText(committedValue!);
  await popover.getByRole("button", { name: "決定", exact: true }).click();
  await expect(popover).toBeHidden();
  await expect(startDateTrigger).toHaveText("未設定");

  await formModal.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(formModal).toBeHidden();
});

test("開始日・終了日を未入力のまま案件を登録できる (Requirement 2.4)", async ({ page }) => {
  const suffix = Date.now();
  const caseName = `e2e-case-nodate-${suffix}`;

  await page.goto("/cases");
  await page.getByRole("button", { name: "案件を登録" }).click();

  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();

  await formModal.getByLabel("案件名").fill(caseName);
  // 開始日・終了日 are both left untouched — Requirement 2.4 permits
  // registering with neither date set.
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await approveMissingDatesConfirm(page);
  await expect(formModal).toBeHidden();

  const caseRow = page.locator("tbody tr", { hasText: caseName });
  await expect(caseRow).toBeVisible();
  // cases/index.vue renders "-" for an unset startDate (`item.startDate ?
  // item.startDate.slice(0, 10) : "-"`); endDate is expected to follow the
  // same "-" convention once unset dates render without error.
  await expect(caseRow.locator("td").nth(1)).toHaveText("-");
  await expect(caseRow.locator("td").nth(2)).toHaveText("-");
});
