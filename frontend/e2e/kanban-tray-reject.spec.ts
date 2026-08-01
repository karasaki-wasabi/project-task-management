// E2E regression: dragging an already-assigned task from a stage column
// into a DIFFERENT assignee's focus tray must show the reassignment error
// and leave the task exactly where it was — not silently vanish it from
// its stage column.
//
// User-reported via Impeccable critique (5th round): the error message
// itself worked, but `handleFocusTrayAssign`'s rejection branch only
// re-synced the focus tray, never the source stage column. Root cause
// (found by logging `columnTasksByStageId` before/after): the array was
// never actually wrong — Sortable physically relocates the real DOM node
// into the tray via direct DOM APIs the instant the drop lands, entirely
// outside Vue's virtual DOM, so a content-based re-sync had nothing to
// diff against and left the (physically relocated) node stuck. Fixed by
// forcing the affected stage columns to remount (a bumped `:key`) instead
// of relying on Vue noticing a content change that never happened, plus an
// `await nextTick()` so a same-drag source-side model update from Sortable
// can't land after the revert and clobber it.
//
// Same manual-mouse-events rationale as ./drag.ts's `dragCardTo` — Sortable
// (`forceFallback` mode) doesn't use native HTML5 drag events.
import { expect, test } from "@playwright/test";
import { dragCardTo } from "./drag";

test("dragging an already-assigned task into a different assignee's focus tray shows the error and leaves the task in its stage column (regression)", async ({
  page,
}) => {
  const suffix = Date.now();
  const userAName = `e2e-reject-user-a-${suffix}`;
  const userBName = `e2e-reject-user-b-${suffix}`;
  const stageName = `e2e-reject-stage-${suffix}`;
  const taskTitle = `e2e-reject-task-${suffix}`;
  const userATaskTitle = `e2e-reject-task-a-${suffix}`;

  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(userAName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userAName })).toBeVisible();
  await page.getByPlaceholder("ユーザー名").fill(userBName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userBName })).toBeVisible();

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
  // focus tray. The backend rejects reassigning an already-assigned task,
  // so this must be a no-op: error shown, task stays in its column.
  const cardInColumn = stageColumn.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, cardInColumn, focusTray);

  await expect(page.locator('[role="alert"]')).toContainText("既に担当者が設定されているタスクは、ここでは再割り当てできません");
  await expect(stageCardList.getByText(taskTitle)).toBeVisible();
  await expect(focusTray.getByText(taskTitle)).not.toBeVisible();
  // A rejected move must not announce a false success.
  await expect(page.locator('[role="status"]')).not.toBeVisible();
});
