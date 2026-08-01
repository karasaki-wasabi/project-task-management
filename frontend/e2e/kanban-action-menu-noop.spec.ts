// E2E regression: opening the keyboard/click action menu on a task that
// already has a stage defaults the "移動先" select to that SAME stage
// (openActionMenu seeds it from the task's current developmentStageId) —
// confirming without touching the select must NOT announce a false
// "moved" success, since no write actually happens for that case.
//
// User-reported via Impeccable critique (6th round): `confirmActionMenu`'s
// same-stage branch made no API call (correct), but fell through to an
// unconditional close+reload+announceMoveSuccess() regardless — the exact
// opposite failure of the "no confirmation on success" bug fixed two
// rounds earlier, this time confirming a move that never happened. Fixed
// by disabling the "移動する" button for this exact case, plus a
// `wroteChange` guard in confirmActionMenu itself as defense-in-depth.
import { expect, test } from "@playwright/test";

test("confirming the action menu with the stage left unchanged does not announce a false success (regression)", async ({ page }) => {
  const suffix = Date.now();
  const stageName = `e2e-noop-stage-${suffix}`;
  const userName = `e2e-noop-user-${suffix}`;
  const taskTitle = `e2e-noop-task-${suffix}`;

  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(userName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userName })).toBeVisible();

  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // Task assigned at creation time so it never needs the assignee-picker.
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.locator("form select").nth(1).selectOption({ label: userName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  const stageCardList = stageColumn.locator(".card-list");

  // Move the task into the stage via the action menu itself (keyboard
  // path), which is a real, legitimate move (task starts stage-less).
  await page.getByRole("button", { name: /展開/ }).click();
  const backlogCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await backlogCard.focus();
  await page.keyboard.press("Enter");
  const stageSelect = page.locator("#action-menu-stage");
  await stageSelect.selectOption({ label: stageName });
  await page.getByRole("button", { name: "移動する" }).click();
  await expect(stageCardList.getByText(taskTitle)).toBeVisible();
  await expect(page.locator('[role="status"]')).toContainText(taskTitle);
  // Let the status message's own auto-clear timer run out before the real
  // assertion below, so a false positive can't be masked by this earlier,
  // legitimate message still being on screen.
  await expect(page.locator('[role="status"]')).not.toBeVisible({ timeout: 5000 });

  // Now the actual regression case: open the action menu again on the
  // SAME task (already in `stageName`) and confirm WITHOUT changing the
  // stage select, which defaults to the task's current stage.
  const cardInColumn = stageColumn.locator(".card[data-task-id]", { hasText: taskTitle });
  await cardInColumn.focus();
  await page.keyboard.press("Enter");
  const confirmButton = page.getByRole("button", { name: "移動する" });
  await expect(confirmButton).toBeDisabled();
  await expect(page.locator('[role="status"]')).not.toBeVisible();

  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.locator('[role="status"]')).not.toBeVisible();
});
