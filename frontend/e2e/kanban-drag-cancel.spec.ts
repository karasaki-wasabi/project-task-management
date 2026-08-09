// E2E regression: dragging a card A → B → back to A (changing your mind
// mid-drag, before releasing) must leave it in A, not silently move it to
// B. User-reported bug: `preventSameListMove`
// (composables/useSameListMoveGuard.ts) compared Sortable's `evt.from`
// (fixed at the ORIGINAL source list for the whole drag gesture) against
// `evt.to`, so returning to the origin list looked identical to "never
// left it" and got wrongly blocked — the card visually snapped back
// on-screen but was never actually re-parented, so it landed in B
// regardless of where the mouse was released. The fix compares the
// dragged element's live DOM parent (`evt.dragged.parentElement`) against
// the candidate list instead, which correctly tells "started here" apart
// from "currently here."
//
// Same manual-mouse-events rationale as ./drag.ts's `dragCardTo` — Sortable
// (`forceFallback` mode) doesn't use native HTML5 drag events, so this
// needs a real multi-hop mouse down/move/move/up sequence, not
// `locator.dragTo()`.
import { expect, registerUser, test } from "./fixtures";

test("dragging a card out to another column and back to its origin before releasing leaves it in the origin column (regression)", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const stageAName = `e2e-cancel-stage-a-${suffix}`;
  const stageBName = `e2e-cancel-stage-b-${suffix}`;
  const userName = `e2e-cancel-user-${suffix}`;
  const taskTitle = `e2e-cancel-task-${suffix}`;

  await registerUser(request, userName);

  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  // Assign at creation time so the drag below never triggers the
  // assignee-picker dialog — this test is only about same-origin cancel.
  await page.locator("form select").nth(1).selectOption({ label: userName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageAName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageAName })).toBeVisible();
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageBName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageBName })).toBeVisible();

  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  const columnA = page.locator(".column[data-stage-id]", { hasText: stageAName });
  const columnB = page.locator(".column[data-stage-id]", { hasText: stageBName });
  const columnAList = columnA.locator(".card-list");
  const columnBList = columnB.locator(".card-list");

  // Get the task into A first via a normal single-hop drag from the backlog.
  await page.getByRole("button", { name: /展開/ }).click();
  const backlogCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await backlogCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  let box = (await backlogCard.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await columnAList.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  let targetBox = (await columnAList.boundingBox())!;
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(columnAList.getByText(taskTitle)).toBeVisible();

  // Now the actual regression case: drag the card from A into B, then back
  // into A, and release there — it must stay in A.
  const card = page.locator(".card[data-task-id]", { hasText: taskTitle });
  box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);

  await columnBList.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  targetBox = (await columnBList.boundingBox())!;
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.waitForTimeout(150);

  await columnAList.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  targetBox = (await columnAList.boundingBox())!;
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(300);

  await expect(columnAList.getByText(taskTitle)).toBeVisible();
  await expect(columnBList.getByText(taskTitle)).not.toBeVisible();
  // A genuine no-op move should not announce a (false) success.
  await expect(page.locator('[role="status"]')).not.toBeVisible();
});
