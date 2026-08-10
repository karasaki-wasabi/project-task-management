// E2E: kanban card drag-and-drop between development stage columns, with
// assignee-selection-on-move for unassigned tasks (task 18.4, Requirements
// 12.1, 12.6, 12.7). Drag-and-drop testing approach: manual mouse
// down/move/up via ./drag.ts's `dragCardTo` — the board now uses
// vue-draggable-plus (Sortable.js, `forceFallback` mode) for the lift/
// cursor-follow/reflow animation (user feedback round 2), which drives
// real mouse events rather than native HTML5 drag events, so
// `locator.dragTo()` no longer exercises the real interaction.
import { expect, registerWorkspaceMember, test } from "./fixtures";
import { dragCardTo } from "./drag";

test("moving an unassigned task's card between kanban columns prompts for an assignee, then moves without prompting again (Requirements 12.1, 12.6, 12.7)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const stageAName = `e2e-stage-a-${suffix}`;
  const stageBName = `e2e-stage-b-${suffix}`;
  const userName = `e2e-kanban-user-${suffix}`;
  const taskTitle = `e2e-kanban-task-${suffix}`;

  await registerWorkspaceMember(page, request, workspace.id, userName);

  await page.goto("/tasks");
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  // Development stage master CRUD now lives on its own page
  // (/kanban/stages); Requirement 7.1/7.3. Registering stages there and
  // then returning to /kanban demonstrates Requirement 7.4 (stage master
  // changes are reflected on the kanban board) since the very next steps
  // use these stages as columns/drop targets on the board.
  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageAName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageAName })).toBeVisible();
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageBName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageBName })).toBeVisible();

  await page.goto("/kanban");
  await expect(page.locator(".column[data-stage-id]", { hasText: stageAName })).toBeVisible();
  await expect(page.locator(".column[data-stage-id]", { hasText: stageBName })).toBeVisible();

  // The newly created task has no development stage yet, so it starts out
  // in the collapsed "開発段階未設定タスク" backlog panel (System Flows:
  // "開発段階未設定タスクのドラッグ継続"), not in any stage column. Expand
  // it so the card is actually rendered and can be used as a drag source.
  await page.getByRole("button", { name: /展開/ }).click();

  const card = page.locator(".card[data-task-id]", { hasText: taskTitle });
  const columnA = page.locator(".column[data-stage-id]", { hasText: stageAName }).locator(".card-list");
  const columnB = page.locator(".column[data-stage-id]", { hasText: stageBName }).locator(".card-list");

  await dragCardTo(page, card, columnA);
  await expect(page.locator(".assignee-picker")).toBeVisible();
  await page.locator(".assignee-picker select").selectOption({ label: userName });
  await page.getByRole("button", { name: "確定" }).click();

  await expect(columnA.getByText(taskTitle)).toBeVisible();
  // TaskCard shows the assignee as an initial-letter avatar with a `title`
  // tooltip carrying the full name (visual redesign, UI/screen.png), not
  // the full name as visible text.
  await expect(columnA.locator(`[title="${userName}"]`)).toBeVisible();

  // The task is now assigned; moving it again must not re-prompt.
  const movedCard = page.locator(".card[data-task-id]", { hasText: taskTitle });
  await dragCardTo(page, movedCard, columnB);
  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(columnB.getByText(taskTitle)).toBeVisible();
});
