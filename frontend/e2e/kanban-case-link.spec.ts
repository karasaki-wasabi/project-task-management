// E2E: associating/dissociating a kanban task with a case, and toggling its
// per-case required flag, from the task detail popup's edit mode (task 9.3,
// design.md Testing Strategy "E2E" — カンバンの既存タスク詳細ポップアップ
// E2E拡張, Requirements 4.1-4.7). New dedicated spec file rather than
// extending kanban.spec.ts (scoped to drag-and-drop between columns) or
// cases.spec.ts (scoped to the /cases page) — this project already
// establishes a scenario-per-file convention for kanban behaviors
// (kanban-tray-reassign.spec.ts, kanban-backlog.spec.ts, kanban-drag-
// cancel.spec.ts, kanban-picker-cancel.spec.ts).
//
// Task/case setup goes through their own pages' registration forms (same
// UI-driven convention as cases.spec.ts/kanban.spec.ts — no direct API
// seeding helper exists in this e2e/ directory). Requires the backend
// (+MySQL) and frontend to already be running (`docker compose up`); see
// playwright.config.ts.
import { expect, test } from "@playwright/test";

async function createTask(page: import("@playwright/test").Page, title: string) {
  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(title);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: title }).first()).toBeVisible();
}

async function createCase(page: import("@playwright/test").Page, name: string) {
  await page.goto("/cases");
  await page.getByRole("button", { name: "案件を登録" }).click();
  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();
  await formModal.getByLabel("案件名").fill(name);
  // No tasks selected here (Requirement 3.7 allows 0-task registration) —
  // this spec associates the task from the kanban side instead, which is
  // exactly what's under test.
  await formModal.getByLabel("終了日").fill("2034-06-30");
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(formModal).toBeHidden();
}

// Opens the task detail popup for `title` from a fresh /kanban navigation
// (so each call re-fetches the task via GET /api/tasks/:id, proving
// server-side persistence rather than lingering client state).
async function openTaskDetail(page: import("@playwright/test").Page, title: string) {
  await page.goto("/kanban");
  // A freshly created task has no development stage/assignee yet, so it
  // starts out in the collapsed "未割り当て" backlog panel (same as
  // kanban.spec.ts) rather than any stage column. Each call here is a fresh
  // navigation, so the panel is always collapsed at this point.
  await page.getByRole("button", { name: /展開/ }).click();
  const card = page.locator(".card[data-task-id]", { hasText: title });
  await expect(card).toBeVisible();
  await card.click();
  const modal = page.locator(".task-detail-modal");
  await expect(modal).toBeVisible();
  return modal;
}

test("タスク詳細ポップアップで案件を関連付け・必須指定して保存すると再表示で反映され、未設定に戻すと必須表示も解除される (Requirements 4.1-4.4, 4.6, 4.7)", async ({
  page,
}) => {
  const suffix = Date.now();
  const taskTitle = `e2e-kanban-case-link-task-${suffix}`;
  const caseName = `e2e-kanban-case-link-case-${suffix}`;

  await createTask(page, taskTitle);
  await createCase(page, caseName);

  let modal = await openTaskDetail(page, taskTitle);

  // View mode starts with no case associated (Requirement 4.1).
  await expect(modal.getByText("案件: —", { exact: true })).toBeVisible();

  await modal.getByRole("button", { name: "編集" }).click();
  await modal.getByLabel("案件", { exact: true }).selectOption({ label: caseName });
  await modal.getByRole("switch", { name: "この案件の必須タスクにする" }).click();
  await modal.getByRole("button", { name: "保存" }).click();

  // Save returns to view mode in place — assert immediately, then also
  // reopen from scratch below to confirm server-side persistence.
  await expect(modal.getByText(`案件: ${caseName}(必須)`, { exact: true })).toBeVisible();

  await modal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(modal).toBeHidden();

  modal = await openTaskDetail(page, taskTitle);
  await expect(modal.getByText(`案件: ${caseName}(必須)`, { exact: true })).toBeVisible();

  await modal.getByRole("button", { name: "編集" }).click();
  const caseSelect = modal.getByLabel("案件", { exact: true });
  await expect(caseSelect).toHaveValue(/.+/);
  const requiredSwitch = modal.getByRole("switch", { name: "この案件の必須タスクにする" });
  await expect(requiredSwitch).toHaveAttribute("aria-checked", "true");

  // Requirement 4.4/4.6: clearing the case association also clears the
  // required flag, both immediately in the UI and after save.
  await caseSelect.selectOption({ label: "案件に紐づけない(未設定)" });
  await expect(requiredSwitch).toHaveAttribute("aria-checked", "false");
  await expect(requiredSwitch).toBeDisabled();

  await modal.getByRole("button", { name: "保存" }).click();
  await expect(modal.getByText("案件: —", { exact: true })).toBeVisible();
  await expect(modal.getByText(`案件: ${caseName}(必須)`, { exact: true })).not.toBeVisible();

  await modal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(modal).toBeHidden();

  modal = await openTaskDetail(page, taskTitle);
  await expect(modal.getByText("案件: —", { exact: true })).toBeVisible();
});

test("必須トグルは案件未選択時のみ非活性になる (Requirement 4.5)", async ({ page }) => {
  const suffix = Date.now();
  const taskTitle = `e2e-kanban-case-toggle-task-${suffix}`;
  const caseName = `e2e-kanban-case-toggle-case-${suffix}`;

  await createTask(page, taskTitle);
  await createCase(page, caseName);

  const modal = await openTaskDetail(page, taskTitle);
  await modal.getByRole("button", { name: "編集" }).click();

  const requiredSwitch = modal.getByRole("switch", { name: "この案件の必須タスクにする" });
  const caseSelect = modal.getByLabel("案件", { exact: true });

  // No case selected yet: the toggle is disabled and cannot be turned on.
  await expect(caseSelect).toHaveValue("");
  await expect(requiredSwitch).toBeDisabled();
  await expect(requiredSwitch).toHaveAttribute("aria-checked", "false");

  // Selecting a case makes the toggle genuinely interactive.
  await caseSelect.selectOption({ label: caseName });
  await expect(requiredSwitch).toBeEnabled();
  await requiredSwitch.click();
  await expect(requiredSwitch).toHaveAttribute("aria-checked", "true");

  // Switching back to 未設定 disables it again and resets the checked state.
  await caseSelect.selectOption({ label: "案件に紐づけない(未設定)" });
  await expect(requiredSwitch).toBeDisabled();
  await expect(requiredSwitch).toHaveAttribute("aria-checked", "false");
});
