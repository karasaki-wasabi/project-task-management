// E2E: two drag paths into/out of the assignee focus tray that, despite
// being core features (round 3's "focus tray drop-to-assign" and "drag a
// tray card straight into a stage column"), had no dedicated E2E coverage
// — every other tray-related spec covers either the assignee-filter chip
// behavior (kanban-assignee-focus.spec.ts) or a rejection/cancel path
// (kanban-tray-reject.spec.ts, kanban-tray-cancel.spec.ts), never the
// plain happy path for these two directions.
//
// 1. Backlog -> focus tray: dropping an unassigned card there assigns it
//    to the focused user (no stage change).
// 2. Focus tray -> stage column: dragging a card already sitting in the
//    tray straight into a column moves it there.
//
// Uses ./drag.ts's `dragCardTo` throughout (not raw mouse events) — the
// stage column created by this test can land far to the right of the
// board's horizontally-scrolling row alongside the many demo/other-spec
// stages, and dragCardTo already handles scrolling both the source and
// target into view before/after picking up the card.
import {
  expect,
  registerWorkspaceMember,
  test,
  workspacePagePath,
} from "./fixtures";
import { dragCardTo } from "./drag";

test("dragging an unassigned backlog card into the focus tray assigns it, and dragging a tray card into a stage column moves it (Requirements 1.2-1.5)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const userName = `e2e-trayassign-user-${suffix}`;
  const stageName = `e2e-trayassign-stage-${suffix}`;
  const taskTitle = `e2e-trayassign-task-${suffix}`;
  // A user with 0 tasks has no workload chip at all (computeWorkloadCounts
  // only counts assignees with >=1 incomplete assigned task), so the focus
  // tray can't be opened by clicking a chip for a brand-new user yet. This
  // second task, assigned directly at creation time, exists purely to make
  // the chip appear before the actual scenario starts.
  const chipSeedTitle = `e2e-trayassign-seed-${suffix}`;

  await registerWorkspaceMember(page, request, workspace.id, userName);

  await page.goto(workspacePagePath(workspace.id, "kanban/stages"));
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  await page.goto(workspacePagePath(workspace.id, "tasks"));
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.getByPlaceholder("タスク名").fill(chipSeedTitle);
  await page.locator("form select").nth(1).selectOption({ label: userName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: chipSeedTitle }).first()).toBeVisible();

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  await page.waitForLoadState("networkidle");
  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  const stageCardList = stageColumn.locator(".card-list");

  await page.getByRole("button", { name: /展開/ }).click();
  const seedCard = page.locator(".card[data-task-id]", { hasText: chipSeedTitle });
  await dragCardTo(page, seedCard, stageCardList);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(chipSeedTitle)).toBeVisible();

  // Now the user's workload chip exists — open their focus tray. Enough
  // users can accumulate across E2E runs to push this chip into
  // TeamWorkloadSummary's folded "+N名" remainder — `expect().toBeVisible()`
  // (unlike a one-shot `isVisible()`) retries, so this waits out any
  // rendering lag before deciding the chip is actually in the remainder.
  const chip = page.getByRole("button", { name: new RegExp(userName) });
  const remainderToggle = page.locator(".remainder-toggle");
  try {
    await expect(chip).toBeVisible({ timeout: 5000 });
  } catch {
    await remainderToggle.click();
    await expect(chip).toBeVisible();
  }
  await chip.click();
  const focusTray = page.locator(".focus-tray");
  await expect(focusTray).toBeVisible();

  // --- Step 1: backlog -> focus tray assigns the (still unassigned) task.
  const backlogCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, backlogCard, focusTray);

  await expect(page.locator('[role="alert"]')).not.toBeVisible();
  await expect(focusTray.getByText(taskTitle)).toBeVisible();
  await expect(page.locator('[role="status"]')).toContainText(taskTitle);

  // --- Step 2: focus tray -> stage column moves the now-assigned task.
  const trayCard = focusTray.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, trayCard, stageCardList);

  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(taskTitle)).toBeVisible();
  // Still shown in the tray too (this assignee's incomplete tasks
  // regardless of stage), just now also placed in the column.
  await expect(focusTray.getByText(taskTitle)).toBeVisible();
});
