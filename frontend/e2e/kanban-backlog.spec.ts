// E2E: UnassignedBacklogPanel (task 5.3, design.md "UnassignedBacklogPanel"
// component detail block and "開発段階未設定タスクのドラッグ継続" (System
// Flows), Requirements 3.2, 3.3, 3.4, 3.5).
//
// Covers, in order:
// - 3.2: while collapsed, no task card/row is rendered anywhere on the page
//   for backlog (developmentStageId-unset) tasks.
// - 3.3: expanding the panel reveals the tasks as rows/cards.
// - 3.4: the title search input filters the expanded list by substring.
// - 3.5: the sort <select> actually changes the rendered order, per the
//   ordering rules in UnassignedBacklogPanel.helpers.ts (priority: high ->
//   medium -> low; createdAt: newest first).
// - Dragging an expanded backlog row onto a stage column reuses the same
//   move-with-assignee-picker flow already covered for stage-board cards in
//   kanban.spec.ts (design.md: this panel's rows are the same TaskCard drag
//   source, wired into the same onDropOnStage handler).
//
// Drag-and-drop approach: manual mouse down/move/up via ./drag.ts's
// `dragCardTo` — the board uses vue-draggable-plus (Sortable.js,
// `forceFallback` mode) for the lift/cursor-follow/reflow animation (user
// feedback round 2), which drives real mouse events, not native HTML5 drag
// events, so neither `locator.dragTo()` nor manually dispatching
// dragstart/dragover/drop events (this file's earlier approach) exercises
// the real interaction anymore.
import { expect, test } from "@playwright/test";
import { dragCardTo } from "./drag";

test("expanding the unassigned backlog reveals search/sort, and dragging an expanded row onto a stage prompts for an assignee before moving (Requirements 3.2, 3.3, 3.4, 3.5)", async ({
  page,
}) => {
  const suffix = Date.now();
  const stageName = `e2e-backlog-stage-${suffix}`;
  const userName = `e2e-backlog-user-${suffix}`;
  // Common prefix lets us scope our own fixtures against any leftover
  // unassigned tasks that may exist in the shared dev DB from other e2e
  // runs, without depending on an exact global backlog count.
  const alphaTitle = `e2e-backlog-alpha-${suffix}`; // priority: high
  const betaTitle = `e2e-backlog-beta-${suffix}`; // priority: low
  const gammaTitle = `e2e-backlog-gamma-${suffix}`; // priority: medium, unique search target

  // 1. Record the badge count *before* creating our fixtures, so we can
  // assert an exact delta later regardless of any pre-existing unassigned
  // tasks in the shared dev DB (Requirement 3.2/3.6 badge count).
  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  const badge = page.locator(".backlog-count");
  await expect(badge).toBeVisible();
  const initialCountText = await badge.textContent();
  const initialCount = Number((initialCountText ?? "0件").replace(/[^\d]/g, ""));

  // 2. Create a development stage as a drop target.
  await page.goto("/kanban/stages");
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(stageName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: stageName })).toBeVisible();

  // 3. Create a user for the assignee-picker step later.
  await page.goto("/users");
  await page.getByPlaceholder("ユーザー名").fill(userName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator("tr", { hasText: userName })).toBeVisible();

  // 4. Create three tasks with distinct titles and priorities, left without
  // a development stage and without an assignee, so they land in the
  // backlog and dragging one later triggers the assignee-picker. The
  // create form has a priority <select> then an assignee <select>; leave
  // the assignee <select> untouched (defaults to "担当者未設定").
  await page.goto("/tasks");
  const priorityOptions: Record<string, string> = { [alphaTitle]: "高", [betaTitle]: "低", [gammaTitle]: "中" };
  const newTaskPrioritySelect = page.locator("form select").nth(0);

  for (const title of [alphaTitle, betaTitle, gammaTitle]) {
    await page.getByPlaceholder("タスク名").fill(title);
    await newTaskPrioritySelect.selectOption({ label: priorityOptions[title] });
    await page.getByRole("button", { name: "タスク登録" }).click();
    await expect(page.locator("li", { hasText: title }).first()).toBeVisible();
  }

  // 5. Back on /kanban: badge reflects the +3 delta (Requirement 3.2/3.6),
  // and none of the three tasks are rendered anywhere on the page while
  // the panel is collapsed (Requirement 3.2).
  await page.goto("/kanban");
  await page.waitForLoadState("networkidle");
  await expect(badge).toHaveText(`${initialCount + 3}件`);
  await expect(page.locator(".card", { hasText: alphaTitle })).not.toBeVisible();
  await expect(page.locator(".card", { hasText: betaTitle })).not.toBeVisible();
  await expect(page.locator(".card", { hasText: gammaTitle })).not.toBeVisible();

  const stageColumn = page.locator(".column[data-stage-id]", { hasText: stageName });
  await expect(stageColumn).toBeVisible();
  const stageCardList = stageColumn.locator(".card-list");

  // 6. Expand the panel: the tasks are now rendered as cards (Requirement
  // 3.3).
  await page.getByRole("button", { name: /展開/ }).click();
  const alphaCard = page.locator(".card[data-task-id]", { hasText: alphaTitle });
  const betaCard = page.locator(".card[data-task-id]", { hasText: betaTitle });
  const gammaCard = page.locator(".card[data-task-id]", { hasText: gammaTitle });
  await expect(alphaCard).toBeVisible();
  await expect(betaCard).toBeVisible();
  await expect(gammaCard).toBeVisible();

  // 7. Title search filters the expanded list (Requirement 3.4): searching
  // for a substring unique to "gamma" shows only that task.
  const searchInput = page.getByPlaceholder("タイトルで検索");
  await searchInput.fill(`e2e-backlog-gamma-${suffix}`);
  await expect(gammaCard).toBeVisible();
  await expect(alphaCard).not.toBeVisible();
  await expect(betaCard).not.toBeVisible();

  // Clear the search before continuing.
  await searchInput.fill("");
  await expect(alphaCard).toBeVisible();
  await expect(betaCard).toBeVisible();
  await expect(gammaCard).toBeVisible();

  // 8. Sort select changes rendered order (Requirement 3.5). Per
  // UnassignedBacklogPanel.helpers.ts: "priority" orders high -> medium ->
  // low (alpha=high, gamma=medium, beta=low, so alpha comes before gamma),
  // while "createdAt" orders newest-first (gamma was created last, so
  // gamma comes before alpha). Asserting the alpha/gamma relative order
  // flips between the two modes proves the sort is actually applied.
  const sortSelect = page.locator(".backlog-sort");

  await sortSelect.selectOption("priority");
  const priorityOrderText = (await page.locator(".backlog-expanded .card").allTextContents()).join("\n");
  const alphaIndexByPriority = priorityOrderText.indexOf(alphaTitle);
  const gammaIndexByPriority = priorityOrderText.indexOf(gammaTitle);
  expect(alphaIndexByPriority).toBeGreaterThanOrEqual(0);
  expect(gammaIndexByPriority).toBeGreaterThanOrEqual(0);
  expect(alphaIndexByPriority).toBeLessThan(gammaIndexByPriority);

  await sortSelect.selectOption("createdAt");
  const createdAtOrderText = (await page.locator(".backlog-expanded .card").allTextContents()).join("\n");
  const alphaIndexByCreatedAt = createdAtOrderText.indexOf(alphaTitle);
  const gammaIndexByCreatedAt = createdAtOrderText.indexOf(gammaTitle);
  expect(alphaIndexByCreatedAt).toBeGreaterThanOrEqual(0);
  expect(gammaIndexByCreatedAt).toBeGreaterThanOrEqual(0);
  expect(gammaIndexByCreatedAt).toBeLessThan(alphaIndexByCreatedAt);

  // 9. Drag an expanded backlog row onto the stage column. The task has no
  // assignee yet, so the assignee-picker dialog must appear before the move
  // completes (same contract as kanban.spec.ts's stage-to-stage drag).
  await dragCardTo(page, alphaCard, stageCardList);
  await expect(page.locator(".assignee-picker")).toBeVisible();
  await page.locator(".assignee-picker select").selectOption({ label: userName });
  await page.getByRole("button", { name: "確定" }).click();

  await expect(page.locator(".assignee-picker")).not.toBeVisible();
  await expect(stageCardList.getByText(alphaTitle)).toBeVisible();
  // TaskCard shows the assignee as an initial-letter avatar with a `title`
  // tooltip carrying the full name (visual redesign, UI/screen.png), not
  // the full name as visible text.
  await expect(stageCardList.locator(`[title="${userName}"]`)).toBeVisible();
});
