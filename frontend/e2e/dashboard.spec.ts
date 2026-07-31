// E2E: dashboard shows overdue deliveries + upcoming events, with
// drill-down navigation (task 18.3, Requirements 11.2, 11.3, 11.4).
import { expect, test } from "@playwright/test";

test("dashboard shows an overdue delivery and an upcoming event, and drills down to the task list (Requirements 11.2-11.4)", async ({
  page,
}) => {
  const suffix = Date.now();
  const deliveryName = `e2e-dash-delivery-${suffix}`;
  const requiredTaskTitle = `e2e-dash-required-task-${suffix}`;
  const eventTitle = `e2e-dash-event-${suffix}`;

  await page.goto("/deliveries");
  await page.getByPlaceholder("納品名", { exact: true }).fill(deliveryName);
  await page.locator('input[type="date"]').fill("2020-01-01");
  await page.getByRole("button", { name: "登録" }).click();
  const deliveryRow = page.locator("tr", { hasText: deliveryName });
  await expect(deliveryRow).toBeVisible();

  await deliveryRow.getByRole("link", { name: "タスクを見る" }).click();
  await expect(page).toHaveURL(/\/tasks\?deliveryId=/);

  await page.getByPlaceholder("タスク名").fill(requiredTaskTitle);
  await page.getByLabel("必須タスク").check();
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: requiredTaskTitle }).first()).toBeVisible();

  await page.goto("/events");
  await page.getByPlaceholder("イベント名").fill(eventTitle);
  await page.locator('input[type="datetime-local"]').fill("2040-01-01T09:00");
  await page.getByRole("button", { name: "イベント登録" }).click();
  await expect(page.locator("li", { hasText: eventTitle }).first()).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(deliveryName)).toBeVisible();
  await expect(page.getByText(eventTitle)).toBeVisible();

  await page.getByText(deliveryName).click();
  await expect(page).toHaveURL(/\/tasks\?deliveryId=/);
  await expect(page.locator("li", { hasText: requiredTaskTitle }).first()).toBeVisible();
});
