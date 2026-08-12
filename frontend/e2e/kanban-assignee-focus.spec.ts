// E2E: assignee-chip-driven focus tray (task 5.2, design.md "担当者絞り込み
// の状態遷移" state diagram / "AssigneeFocusTray" and "kanban/index.vue"
// component blocks, Requirements 1.1, 1.2). Round 3 user feedback removed
// the stage-board-narrowing behavior (was Requirement 4.2/4.3) — a chip
// click now only drives the focus tray, since filtering both was
// redundant. This test verifies the board stays showing everyone
// regardless of chip selection.
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
import {
  expect,
  registerWorkspaceMember,
  test,
  workspacePagePath,
} from "./fixtures";
import { dragCardTo } from "./drag";

test("selecting an assignee in the kanban filter links the focus tray and stage board to that assignee, and clearing it hides the tray again (Requirements 1.1, 1.2, 4.2, 4.3)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const userAName = `e2e-focus-user-a-${suffix}`;
  const userBName = `e2e-focus-user-b-${suffix}`;
  const stageName = `e2e-focus-stage-${suffix}`;
  const taskATitle = `e2e-focus-task-a-${suffix}`;
  const taskBTitle = `e2e-focus-task-b-${suffix}`;

  // 1. Create two distinct accounts for the assignee fixtures.
  await registerWorkspaceMember(page, request, workspace.id, userAName);
  await registerWorkspaceMember(page, request, workspace.id, userBName);

  // 2. Create a development stage.
  await page.goto(workspacePagePath(workspace.id, "kanban/stages"));
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // 3. Create two tasks, each assigned to a different user at creation time
  // via the /tasks form's assignee <select> (simpler and more reliable than
  // driving the kanban board's move-with-assignee-picker flow, since it
  // sidesteps that dialog entirely).
  await page.goto(workspacePagePath(workspace.id, "tasks"));
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
  await page.goto(workspacePagePath(workspace.id, "kanban"));
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

  // 4. Default (nothing selected): focus tray is not present (Requirement
  // 1.1), and the stage column shows both tasks. The assignee selector is
  // the merged TeamWorkloadSummary (user feedback round 2:
  // "担当者絞り込みの欄とチーム負荷の欄を共通化") — one chip per team
  // member, instead of a <select>. Round 3 removed the standalone "すべて"
  // chip since board-wide filtering was already gone by then; clicking a
  // selected member's own chip again is now how you clear the selection.
  await expect(page.getByText("担当者フォーカス")).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();

  // 5. Click user A's workload chip: focus tray appears showing user A's
  // task (Requirement 1.2). Round 3: the stage board is NOT filtered by
  // this selection anymore — both tasks must remain visible there. Enough
  // assignees can accumulate across E2E/manual-testing runs to push a
  // chip into TeamWorkloadSummary's folded "+N名" remainder —
  // `expect().toBeVisible()` (unlike a one-shot `isVisible()`) retries, so
  // this waits out any rendering lag before deciding the chip is actually
  // in the remainder.
  const userAChip = page.getByRole("button", { name: new RegExp(userAName) });
  try {
    await expect(userAChip).toBeVisible({ timeout: 5000 });
  } catch {
    await page.locator(".remainder-toggle").click();
    await expect(userAChip).toBeVisible();
  }
  await userAChip.click();
  const focusTray = page.locator(".focus-tray");
  await expect(focusTray).toBeVisible();
  await expect(focusTray.getByText(taskATitle)).toBeVisible();
  await expect(focusTray.getByText(taskBTitle)).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();

  // 6. Click user B's chip: focus tray updates to user B's task; board
  // still shows both.
  const userBChip = page.getByRole("button", { name: new RegExp(userBName) });
  try {
    await expect(userBChip).toBeVisible({ timeout: 5000 });
  } catch {
    await page.locator(".remainder-toggle").click();
    await expect(userBChip).toBeVisible();
  }
  await userBChip.click();
  await expect(focusTray).toBeVisible();
  await expect(focusTray.getByText(taskBTitle)).toBeVisible();
  await expect(focusTray.getByText(taskATitle)).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();

  // 7. Click user B's chip again (toggle off): focus tray disappears
  // (Requirement 1.1).
  await userBChip.click();
  await expect(page.getByText("担当者フォーカス")).not.toBeVisible();
  await expect(stageCardList.getByText(taskATitle)).toBeVisible();
  await expect(stageCardList.getByText(taskBTitle)).toBeVisible();
});
