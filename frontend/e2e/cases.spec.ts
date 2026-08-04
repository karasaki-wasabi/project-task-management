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
import { expect, test } from "@playwright/test";

async function createUnassignedTask(page: import("@playwright/test").Page, title: string) {
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(title);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: title }).first()).toBeVisible();
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
  await formModal.getByLabel("開始日").fill("2034-06-01");
  await formModal.getByLabel("終了日").fill("2034-06-30");

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
  await formModal.getByLabel("終了日").fill("2020-01-02");

  const overdueRow = formModal.locator(".task-row", { hasText: overdueTaskTitle });
  await expect(overdueRow).toBeVisible();
  await overdueRow.getByRole("switch", { name: `${overdueTaskTitle} を選択` }).click();
  await overdueRow.getByRole("switch", { name: `${overdueTaskTitle} を必須タスクにする` }).click();

  await formModal.getByRole("button", { name: "登録", exact: true }).click();
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
