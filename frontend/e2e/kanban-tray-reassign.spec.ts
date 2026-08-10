// E2E regression/behavior: dragging an already-assigned task from a stage
// column into a DIFFERENT assignee's focus tray reassigns it (overwriting
// the existing assignee) rather than being rejected.
//
// This spec used to assert the opposite (a rejection, with an error
// message and the task left untouched) — that was a deliberate
// implementation constraint mirroring the backend's `updateDevelopmentStage`
// endpoint, which never overwrites an existing assignee. kanban-ux-redesign
// Requirement 9 reverses this: dropping onto the focus tray now always
// reassigns, via the general `updateTask` API (task-delivery-management
// task 3.3) rather than `updateDevelopmentStage`, since that overwrite
// restriction was specific to stage-column moves (Requirement 12.8) and
// never applied to this drop target as a documented rule.
//
// Same manual-mouse-events rationale as ./drag.ts's `dragCardTo` — Sortable
// (`forceFallback` mode) doesn't use native HTML5 drag events.
import { expect, registerWorkspaceMember, test } from "./fixtures";
import { dragCardTo } from "./drag";

test("dragging an already-assigned task into a different assignee's focus tray reassigns it (Requirement 9)", async ({ page, request, workspace }) => {
  const suffix = Date.now();
  const userAName = `e2e-reassign-user-a-${suffix}`;
  const userBName = `e2e-reassign-user-b-${suffix}`;
  const stageName = `e2e-reassign-stage-${suffix}`;
  const taskTitle = `e2e-reassign-task-${suffix}`;
  const userATaskTitle = `e2e-reassign-task-a-${suffix}`;

  await registerWorkspaceMember(page, request, workspace.id, userAName);
  await registerWorkspaceMember(page, request, workspace.id, userBName);

  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // The main task is assigned to user B at creation time. A second task is
  // also assigned to user A, purely so user A's workload chip renders at
  // all (TeamWorkloadSummary only shows assignees with >=1 incomplete
  // assigned task, per computeWorkloadCounts in index.helpers.ts) — this
  // second task otherwise plays no role in the scenario.
  await page.goto("/tasks");
  const assigneeSelect = page.locator("form select").nth(1);
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await assigneeSelect.selectOption({ label: userBName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.getByPlaceholder("タスク名").fill(userATaskTitle);
  await assigneeSelect.selectOption({ label: userAName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: userATaskTitle }).first()).toBeVisible();

  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  const stageCardList = stageColumn.locator(".card-list");

  // Get both tasks into the stage column first (already assigned, so no
  // assignee-picker prompt) — user A's task needs a stage too, since
  // computeWorkloadCounts only counts tasks that have one.
  await page.getByRole("button", { name: /展開/ }).click();
  const card = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, card, stageCardList);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(taskTitle)).toBeVisible();

  await page.waitForTimeout(300);
  const userACard = page.locator(".card[data-task-id]", { hasText: userATaskTitle });
  await dragCardTo(page, userACard, stageCardList);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(userATaskTitle)).toBeVisible();

  // Open user A's focus tray — a different assignee than the task's own.
  // When run alongside other E2E specs, enough users can accumulate to
  // push this chip into TeamWorkloadSummary's folded "+N名" remainder —
  // `expect().toBeVisible()` (unlike a one-shot `isVisible()`) retries, so
  // this waits out any rendering lag before deciding the chip is actually
  // in the remainder.
  const userAChip = page.getByRole("button", { name: new RegExp(userAName) });
  try {
    await expect(userAChip).toBeVisible({ timeout: 5000 });
  } catch {
    await page.locator(".remainder-toggle").click();
    await expect(userAChip).toBeVisible();
  }
  await userAChip.click();
  const focusTray = page.locator(".focus-tray");
  await expect(focusTray).toBeVisible();

  // Drag the (user-B-assigned) task from its stage column into user A's
  // focus tray. This now reassigns it to user A (Requirement 9): no error,
  // it disappears from user B's implied ownership and shows up in user A's
  // focus tray, still placed in the same stage column.
  const cardInColumn = stageColumn.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, cardInColumn, focusTray);

  await expect(page.locator('[role="alert"]')).not.toBeVisible();
  await expect(page.locator('[role="status"]')).toContainText(taskTitle);
  await expect(focusTray.getByText(taskTitle)).toBeVisible();
  await expect(stageCardList.getByText(taskTitle)).toBeVisible();
});
