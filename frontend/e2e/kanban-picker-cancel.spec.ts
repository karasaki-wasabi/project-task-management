// E2E regression: clicking "キャンセル" on the assignee-picker dialog (shown
// when dropping an unassigned task onto a stage column) must leave the task
// exactly where it started — not stranded in the target column, not
// duplicated, not silently vanished.
//
// This exercises `cancelPendingMove()` -> `revertOptimisticMove()`, the
// exact function fixed for the "rejected focus-tray reassignment" bug
// (kanban-tray-reject.spec.ts) — Sortable had already physically moved the
// dragged DOM node into the stage column's list before the picker even
// opens, entirely outside Vue's virtual DOM, so reverting it needs the same
// forced-remount fix, not just a content-based array re-sync. Despite this
// being one of the oldest interactions on this board (round 3's original
// resync-strategy fix targeted this exact dialog), the CANCEL button itself
// had no dedicated E2E coverage — every existing picker test
// (kanban.spec.ts, kanban-backlog.spec.ts) only exercises "確定" (confirm).
import { expect, test } from "./fixtures";
import { dragCardTo } from "./drag";

test("canceling the assignee-picker leaves the dropped task back in the backlog, not stranded in the target column (regression)", async ({
  page,
}) => {
  const suffix = Date.now();
  const stageName = `e2e-pickercancel-stage-${suffix}`;
  const taskTitle = `e2e-pickercancel-task-${suffix}`;

  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // Unassigned task (no assignee selected at creation) lands in the backlog.
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  const stageCardList = stageColumn.locator(".card-list");
  const badge = page.locator(".backlog-count");
  const beforeCountText = await badge.textContent();
  const beforeCount = Number((beforeCountText ?? "0件").replace(/[^\d]/g, ""));

  await page.getByRole("button", { name: /展開/ }).click();
  const backlogCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, backlogCard, stageCardList);
  await expect(page.locator(".assignee-picker")).toBeVisible();

  // Cancel instead of confirming.
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.locator(".assignee-picker")).not.toBeVisible();

  // The task must be back in the backlog (badge count unchanged from
  // before the drag) and NOT present in the stage column it was dropped on.
  await expect(badge).toHaveText(`${beforeCount}件`);
  await expect(page.locator(".card[data-task-id]", { hasText: taskTitle })).toBeVisible();
  await expect(stageCardList.getByText(taskTitle)).not.toBeVisible();

  // No duplicate: exactly one card with this task's title anywhere on the
  // page (round-3's original bug for this exact dialog was a stale
  // duplicate card left behind after cancel).
  await expect(page.locator(".card", { hasText: taskTitle })).toHaveCount(1);
});
