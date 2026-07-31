// E2E: kanban card drag-and-drop between development stage columns, with
// assignee-selection-on-move for unassigned tasks (task 18.4, Requirements
// 12.1, 12.6, 12.7). Drag-and-drop testing approach: Playwright's
// `locator.dragTo()`, which dispatches native HTML5 drag events and works
// correctly against this app's browser-standard HTML5 Drag and Drop API
// implementation (design.md Technology Stack; recorded in
// .kiro/steering/testing.md).
import { expect, test } from "@playwright/test";

test("moving an unassigned task's card between kanban columns prompts for an assignee, then moves without prompting again (Requirements 12.1, 12.6, 12.7)", async ({
  page,
}) => {
  const suffix = Date.now();
  const stageAName = `e2e-stage-a-${suffix}`;
  const stageBName = `e2e-stage-b-${suffix}`;
  const userName = `e2e-kanban-user-${suffix}`;
  const taskTitle = `e2e-kanban-task-${suffix}`;

  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(userName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userName })).toBeVisible();

  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  await page.goto("/kanban");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageAName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageAName })).toBeVisible();
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageBName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageBName })).toBeVisible();

  const card = page.locator(".card[data-task-id]", { hasText: taskTitle });
  const columnA = page.locator(".column[data-stage-id]", { hasText: stageAName }).locator(".card-list");
  const columnB = page.locator(".column[data-stage-id]", { hasText: stageBName }).locator(".card-list");

  await card.dragTo(columnA);
  await expect(page.locator(".assignee-picker")).toBeVisible();
  await page.locator(".assignee-picker select").selectOption({ label: userName });
  await page.getByRole("button", { name: "確定" }).click();

  await expect(columnA.getByText(taskTitle)).toBeVisible();
  await expect(columnA.getByText(userName)).toBeVisible();

  // The task is now assigned; moving it again must not re-prompt.
  const movedCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await movedCard.dragTo(columnB);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(columnB.getByText(taskTitle)).toBeVisible();
});
