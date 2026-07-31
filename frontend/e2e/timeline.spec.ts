// E2E: tasks + events integrated timeline (task 12.2, Requirement 4.2).
import { expect, test } from "@playwright/test";

test("tasks and events appear together on the timeline, distinguishable by kind (Requirement 4.2)", async ({
  page,
}) => {
  const suffix = Date.now();
  const taskTitle = `e2e-timeline-task-${suffix}`;
  const eventTitle = `e2e-timeline-event-${suffix}`;

  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  const taskRow = page.locator("li", { hasText: taskTitle }).first();
  await expect(taskRow).toBeVisible();
  // The timeline plots tasks by scheduledDate/completedAt (design.md
  // Implementation Notes); a brand-new task has neither, so mark it done to
  // give it a plottable time.
  await taskRow.locator("select").selectOption("done");

  await page.goto("/events");
  await page.getByPlaceholder("イベント名").fill(eventTitle);
  await page.locator('input[type="datetime-local"]').fill("2040-01-01T09:00");
  await page.getByRole("button", { name: "イベント登録" }).click();

  const eventEntry = page.locator("li[data-kind='event']", { hasText: eventTitle });
  await expect(eventEntry).toBeVisible();
  await expect(eventEntry).toContainText("イベント");

  const taskEntry = page.locator("li[data-kind='task']", { hasText: taskTitle });
  await expect(taskEntry).toBeVisible();
  await expect(taskEntry).toContainText("タスク");
});
