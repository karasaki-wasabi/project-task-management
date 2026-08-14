// E2E: story points on create form, kanban TaskDetailModal, and task-detail
// TaskFieldCard (velocity-dashboard 7.1; Requirements 1.1, 1.2, 1.3, 1.5, 2.5).
//
// Run (CORS_ORIGIN と揃える。127.0.0.1 だと登録が Failed to fetch になる):
//   E2E_BASE_URL=http://localhost:3401 E2E_API_BASE_URL=http://localhost:3400 \
//     npm run test:e2e -- e2e/velocity-story-points.spec.ts
import type { APIRequestContext } from "@playwright/test";
import {
  expect,
  test,
  workspacePagePath,
  workspaceScopedHeaders,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

test.setTimeout(60_000);

async function createTask(
  request: APIRequestContext,
  workspaceId: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; title: string; storyPoints: number | null }> {
  const response = await request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: { title, priority: "medium", ...extra },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as {
    id: string;
    title: string;
    storyPoints: number | null;
  };
}

test("タスク作成フォームで葉タスクにポイントを入力・保存できる (Requirements 1.1, 1.2)", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `e2e-sp-create-${suffix}`;

  await page.goto(workspacePagePath(workspace.id, "tasks"));
  await expect(page.getByTestId("story-points-input")).toBeVisible();
  await page.getByPlaceholder("タスク名").fill(title);
  await page.getByTestId("story-points-input").fill("5");
  await page.getByRole("button", { name: "タスク登録" }).click();

  const row = page.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();

  const listResponse = await page.request.get(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(page.request, workspace.id),
  });
  expect(listResponse.ok()).toBeTruthy();
  const listed = (await listResponse.json()) as Array<{
    id: string;
    title: string;
    storyPoints: number | null;
  }>;
  const created = listed.find((task) => task.title === title);
  expect(created).toBeTruthy();
  expect(created!.storyPoints).toBe(5);

  await page.goto(`${workspacePagePath(workspace.id, "tasks")}/${created!.id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByTestId("story-points-value")).toHaveText("5");
});

test("カンバン編集モーダルで葉は入力保存、親は読み取り専用 (Requirements 1.3, 1.5, 2.5)", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const leafTitle = `e2e-sp-kanban-leaf-${suffix}`;
  const parentTitle = `e2e-sp-kanban-parent-${suffix}`;
  const childTitle = `e2e-sp-kanban-child-${suffix}`;

  const leaf = await createTask(page.request, workspace.id, leafTitle, {
    storyPoints: 3,
  });
  const parent = await createTask(page.request, workspace.id, parentTitle);
  await createTask(page.request, workspace.id, childTitle, {
    parentTaskId: parent.id,
    storyPoints: 8,
  });

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  await page.getByRole("button", { name: /展開/ }).click();

  await page.locator(`.card[data-task-id="${leaf.id}"]`).click();
  const leafModal = page.locator(".task-detail-modal");
  await expect(leafModal).toBeVisible();
  await leafModal.getByRole("button", { name: "編集", exact: true }).click();
  const leafInput = leafModal.getByTestId("story-points-input");
  await expect(leafInput).toBeVisible();
  await expect(leafInput).toHaveValue("3");
  await leafInput.fill("13");
  await leafModal.getByRole("button", { name: "保存", exact: true }).click();
  await expect(leafModal.getByRole("button", { name: "編集", exact: true })).toBeVisible();
  await leafModal.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(leafModal).toBeHidden();

  const leafGet = await page.request.get(`${API_BASE_URL}/api/tasks/${leaf.id}`, {
    headers: await workspaceScopedHeaders(page.request, workspace.id),
  });
  expect(leafGet.ok()).toBeTruthy();
  expect(((await leafGet.json()) as { storyPoints: number }).storyPoints).toBe(13);

  await page.locator(`.card[data-task-id="${parent.id}"]`).click();
  const parentModal = page.locator(".task-detail-modal");
  await expect(parentModal).toBeVisible();
  await parentModal.getByRole("button", { name: "編集", exact: true }).click();
  await expect(parentModal.getByTestId("story-points-input")).toHaveCount(0);
  await expect(parentModal.getByTestId("story-points-readonly")).toHaveText("8");
  await expect(parentModal.getByText("子の合計(自動計算)", { exact: true })).toBeVisible();
});

test("タスク詳細 TaskFieldCard で葉はピッカー、親は編集操作なし (Requirements 1.3, 1.5, 2.5)", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const leafTitle = `e2e-sp-detail-leaf-${suffix}`;
  const parentTitle = `e2e-sp-detail-parent-${suffix}`;
  const childTitle = `e2e-sp-detail-child-${suffix}`;

  const leaf = await createTask(page.request, workspace.id, leafTitle, {
    storyPoints: 2,
  });
  const parent = await createTask(page.request, workspace.id, parentTitle);
  await createTask(page.request, workspace.id, childTitle, {
    parentTaskId: parent.id,
    storyPoints: 5,
  });

  await page.goto(`${workspacePagePath(workspace.id, "tasks")}/${leaf.id}`);
  await expect(page.getByRole("heading", { name: leafTitle })).toBeVisible();
  await expect(page.getByTestId("story-points-value")).toHaveText("2");
  await expect(page.getByTestId("story-points-parent-badge")).toHaveCount(0);

  const leafPointsRow = page.getByLabel("ストーリーポイントの行。選択すると編集操作を表示します");
  await leafPointsRow.hover();
  await leafPointsRow.getByRole("button", { name: "ストーリーポイントを編集" }).click();
  const picker = page.getByTestId("inline-editable-picker");
  await expect(picker.getByTestId("story-points-input")).toBeVisible();
  await picker.getByTestId("story-points-input").fill("7");
  await picker.getByTestId("story-points-picker-form").getByRole("button", { name: "更新" }).click();
  await expect(page.getByTestId("story-points-value")).toHaveText("7");

  await page.reload();
  await expect(page.getByTestId("story-points-value")).toHaveText("7");

  await page.goto(`${workspacePagePath(workspace.id, "tasks")}/${parent.id}`);
  await expect(page.getByRole("heading", { name: parentTitle })).toBeVisible();
  await expect(page.getByTestId("story-points-field")).toBeVisible();
  await expect(page.getByTestId("story-points-value")).toHaveText("5");
  await expect(page.getByTestId("story-points-parent-badge")).toHaveText("子の合計(自動計算)");
  await expect(
    page.getByLabel("ストーリーポイントの行。選択すると編集操作を表示します"),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ストーリーポイントを編集" })).toHaveCount(0);
  await expect(page.getByTestId("story-points-input")).toHaveCount(0);
});
