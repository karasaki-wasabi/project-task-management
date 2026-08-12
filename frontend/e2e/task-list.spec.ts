// E2E: task list status/priority visibility + on_hold persistence
// (task 12.1, Requirements 1.2, 1.4). Requires the backend (+MySQL) and
// frontend to already be running (`docker compose up`); see
// playwright.config.ts.
import {
  expect,
  test,
  workspacePagePath,
} from "./fixtures";

test("task list shows status/priority at a glance, and an on_hold task stays in the list (Requirements 1.2, 1.4)", async ({
  page,
  workspace,
}) => {
  const title = `e2e-task-${Date.now()}`;

  await page.goto(workspacePagePath(workspace.id, "tasks"));
  await page.getByPlaceholder("タスク名").fill(title);
  await page.locator("form select").first().selectOption("high");
  await page.getByRole("button", { name: "タスク登録" }).click();

  const row = page.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-priority", "high");

  await row.locator("select").selectOption("on_hold");
  await expect(row).toHaveAttribute("data-status", "on_hold");

  // Reload to prove on_hold persisted server-side and the list still
  // includes it (Requirement 1.4: 保留タスクを一覧から消さずに表示し続ける).
  await page.reload();
  const reloadedRow = page.locator("li", { hasText: title }).first();
  await expect(reloadedRow).toBeVisible();
  await expect(reloadedRow).toHaveAttribute("data-status", "on_hold");
});
