// E2E: assignee filter narrows tasks/events lists (task 12.3, Requirement
// 7.2).
import { expect, test } from "@playwright/test";

test("filtering by assignee narrows the task list to only that assignee's tasks (Requirement 7.2)", async ({
  page,
}) => {
  const suffix = Date.now();
  const userName = `e2e-user-${suffix}`;
  const matchingTitle = `e2e-matching-${suffix}`;
  const nonMatchingTitle = `e2e-nonmatching-${suffix}`;

  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(userName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userName })).toBeVisible();

  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(nonMatchingTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: nonMatchingTitle }).first()).toBeVisible();

  await page.getByPlaceholder("タスク名").fill(matchingTitle);
  await page.locator("form select").last().selectOption({ label: userName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: matchingTitle }).first()).toBeVisible();

  await page.locator("select").filter({ hasText: "すべて" }).selectOption({ label: userName });

  await expect(page.locator("li", { hasText: matchingTitle }).first()).toBeVisible();
  await expect(page.locator("li", { hasText: nonMatchingTitle })).toHaveCount(0);
});
