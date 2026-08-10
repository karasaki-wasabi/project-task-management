// E2E regression: dragging a card OUT of the assignee focus tray toward a
// stage column, then changing your mind and releasing it back inside the
// tray itself, must leave it exactly where it was in the tray — no
// duplicate, no vanish, no stuck drop-target highlight on the column that
// was briefly hovered.
//
// This is a distinct code path from kanban-tray-reject.spec.ts (which
// covers the business-logic REJECTION of dragging an already-assigned task
// INTO the tray) — this one is a pure drag CANCEL, entirely client-side,
// dragging OUT of the tray and back in before ever completing a drop
// elsewhere. AssigneeFocusTray.vue's `handleEnd` previously only emitted
// `end` when `targetStageId` was set, so this exact "dropped back in the
// tray itself" case never notified the parent at all — silently leaving
// whichever column had last been hovered permanently highlighted
// (Impeccable fourth critique P1, fixed by emitting whenever there's a
// taskId, matching UnassignedBacklogPanel's identical handler).
import { expect, registerWorkspaceMember, test } from "./fixtures";

test("dragging a card out of the focus tray and back into itself leaves it there with no stuck highlight (regression)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const userName = `e2e-traycancel-user-${suffix}`;
  const stageName = `e2e-traycancel-stage-${suffix}`;
  const taskTitle = `e2e-traycancel-task-${suffix}`;

  await registerWorkspaceMember(page, request, workspace.id, userName);

  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // Task assigned to the user at creation time and placed into the stage,
  // so it appears in that user's focus tray once selected.
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.locator("form select").nth(1).selectOption({ label: userName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  const stageCardList = stageColumn.locator(".card-list");
  const stageId = await stageColumn.getAttribute("data-stage-id");

  // Move the task into the stage first (already assigned, no picker). Task
  // has no stage yet, so it starts in the backlog — expand and drag it into
  // the target stage.
  await page.getByRole("button", { name: /展開/ }).click();
  const backlogCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await backlogCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  let box = (await backlogCard.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await stageCardList.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  let targetBox = (await stageCardList.boundingBox())!;
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 50, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(taskTitle)).toBeVisible();

  // Open the focus tray for this user. Enough users can accumulate across
  // E2E runs to push this chip into TeamWorkloadSummary's folded "+N名"
  // remainder — `expect().toBeVisible()` (unlike a one-shot `isVisible()`)
  // retries, so this waits out any rendering lag before deciding the chip
  // is actually in the remainder.
  const chip = page.getByRole("button", { name: new RegExp(userName) });
  try {
    await expect(chip).toBeVisible({ timeout: 5000 });
  } catch {
    await page.locator(".remainder-toggle").click();
    await expect(chip).toBeVisible();
  }
  await chip.click();
  const focusTray = page.locator(".focus-tray");
  await expect(focusTray).toBeVisible();
  await expect(focusTray.getByText(taskTitle)).toBeVisible();

  // Drag the card out of the tray toward the stage column, then change
  // course and release it back inside the tray itself.
  const trayCard = focusTray.locator(".card[data-task-id]", { hasText: taskTitle });
  box = (await trayCard.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  targetBox = (await stageCardList.boundingBox())!;
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 50, { steps: 20 });
  await page.waitForTimeout(150);
  const trayBox = (await focusTray.boundingBox())!;
  await page.mouse.move(trayBox.x + trayBox.width / 2, trayBox.y + trayBox.height / 2, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);

  // Still exactly one card for this task within the tray itself (the same
  // task legitimately also renders in its stage column — this assignee's
  // tray shows all their incomplete tasks regardless of stage — so the
  // "no duplicate" check must be scoped to the tray, not the whole page).
  await expect(focusTray.locator(".card[data-task-id]", { hasText: taskTitle })).toHaveCount(1);
  await expect(focusTray.getByText(taskTitle)).toBeVisible();
  // No false success message for what was ultimately a no-op.
  await expect(page.locator('[role="status"]')).not.toBeVisible();
  // The briefly-hovered stage column must not retain the drop-target
  // highlight (Impeccable fourth critique P1).
  const stillHighlighted = await page.evaluate(
    (id) => document.querySelector(`.column[data-stage-id="${id}"]`)?.classList.contains("kanban-drop-target-active"),
    stageId,
  );
  expect(stillHighlighted).toBe(false);
});
