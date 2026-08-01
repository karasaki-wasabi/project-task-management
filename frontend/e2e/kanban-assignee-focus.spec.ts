// E2E: assignee-filter-driven focus tray + stage board linkage (task 5.2,
// design.md "担当者絞り込みの状態遷移" state diagram / "AssigneeFocusTray" and
// "kanban/index.vue" component blocks, Requirements 1.1, 1.2, 4.2, 4.3).
//
// Approach note: unlike kanban.spec.ts (which drags an *unassigned* task
// onto a stage column to exercise the assignee-picker-on-move flow), this
// test assigns each task to its user directly at creation time via the
// /tasks form (frontend/pages/tasks/index.vue already has an assignee
// <select> in the create form). That way dragging the card onto the stage
// column never triggers the assignee-picker dialog (onDropOnStage in
// kanban/index.vue only prompts when task.assigneeUserId is unset), keeping
// this test focused purely on assignee-filter behavior rather than the
// move-with-assignee-prompt flow already covered by kanban.spec.ts.
import { expect, test } from "@playwright/test";
import { dragCardTo } from "./drag";

test("selecting an assignee in the kanban filter links the focus tray and stage board to that assignee, and clearing it hides the tray again (Requirements 1.1, 1.2, 4.2, 4.3)", async ({
  page,
}) => {
  const suffix = Date.now();
  const userAName = `e2e-focus-user-a-${suffix}`;
  const userBName = `e2e-focus-user-b-${suffix}`;
  const stageName = `e2e-focus-stage-${suffix}`;
  const taskATitle = `e2e-focus-task-a-${suffix}`;
  const taskBTitle = `e2e-focus-task-b-${suffix}`;

  // 1. Create two distinct users.
  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(userAName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userAName })).toBeVisible();
  await page.getByPlaceholder("ユーザー名").fill(userBName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userBName })).toBeVisible();

  // 2. Create a development stage.
  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // 3. Create two tasks, each assigned to a different user at creation time
  // via the /tasks form's assignee <select> (simpler and more reliable than
  // driving the kanban board's move-with-assignee-picker flow, since it
  // sidesteps that dialog entirely).
  await page.goto("/tasks");
  // The create form has two <select>s (priority, then assignee); target the
  // assignee one by position since it has no distinguishing role/label.
  const newTaskAssigneeSelect = page.locator("form select").nth(1);

  await page.getByPlaceholder("タスク名").fill(taskATitle);
  await newTaskAssigneeSelect.selectOption({ label: userAName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskATitle }).first()).toBeVisible();

  await page.getByPlaceholder("タスク名").fill(taskBTitle);
  await newTaskAssigneeSelect.selectOption({ label: userBName });
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskBTitle }).first()).toBeVisible();

  // Move both tasks onto the newly created stage column so the board's
  // per-stage list has something to filter (Requirement 4.2/4.3). Both
  // tasks already have an assignee, so no assignee-picker dialog appears.
  await page.goto("/kanban");
  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  await expect(stageColumn).toBeVisible();
  const stageCardList = stageColumn.locator(".card-list");

  await page.getByRole("button", { name: /展開/ }).click();

  const cardA = page.locator(".card[data-task-id]", { hasText: taskATitle });
  await dragCardTo(page, cardA, stageCardList);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();

  const cardB = page.locator(".card[data-task-id]", { hasText: taskBTitle });
  await dragCardTo(page, cardB, stageCardList);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();

  // 4. Default "すべて": focus tray is not present (Requirement 1.1), and
  // the stage column shows both tasks. The assignee selector is now the
  // merged TeamWorkloadSummary (user feedback round 2:
  // "担当者絞り込みの欄とチーム負荷の欄を共通化") — a clickable "すべて"
  // chip plus one chip per team member, instead of a <select>.
  const allChip = page.getByRole("button", { name: "すべて", exact: true });
  await expect(page.getByText("担当者フォーカス")).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();

  // 5. Click user A's workload chip: focus tray appears showing user A's
  // task (Requirement 1.2), and the stage column narrows to only user A's
  // task (Requirement 4.2/4.3).
  const userAChip = page.getByRole("button", { name: new RegExp(userAName) });
  await userAChip.click();
  const focusTray = page.locator(".focus-tray");
  await expect(focusTray).toBeVisible();
  await expect(focusTray.getByText(taskATitle)).toBeVisible();
  await expect(focusTray.getByText(taskBTitle)).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).not.toBeVisible();

  // 6. Click user B's chip: focus tray updates to user B's task, and the
  // board column now shows only user B's task.
  const userBChip = page.getByRole("button", { name: new RegExp(userBName) });
  await userBChip.click();
  await expect(focusTray).toBeVisible();
  await expect(focusTray.getByText(taskBTitle)).toBeVisible();
  await expect(focusTray.getByText(taskATitle)).not.toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).not.toBeVisible();

  // 7. Click "すべて" again: focus tray disappears again (Requirement 1.1),
  // and the board column shows both tasks again.
  await allChip.click();
  await expect(page.getByText("担当者フォーカス")).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();
});
