import type { APIRequestContext, Page } from "@playwright/test";
import {
  expect,
  registerWorkspaceMember,
  test,
  workspacePagePath,
  workspaceScopedHeaders,
  type RegisteredUser,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

test.setTimeout(60_000);

async function createTask(
  request: APIRequestContext,
  workspaceId: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const response = await request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: { title, priority: "medium", ...extra },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; title: string };
}

async function login(page: Page, user: RegisteredUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test("インライン編集、コメント権限、編集済み表示、タイムライン絞り込みが連携する", async ({
  page,
  request,
  browser,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const originalTitle = `e2e-task-detail-original-${suffix}`;
  const updatedTitle = `e2e-task-detail-updated-${suffix}`;
  const ownComment = `e2e-own-comment-${suffix}`;
  const editedComment = `e2e-own-comment-edited-${suffix}`;
  const otherComment = `e2e-other-comment-${suffix}`;
  const task = await createTask(page.request, workspace.id, originalTitle);

  await page.goto(`${workspacePagePath(workspace.id, "tasks")}/${task.id}`);
  await expect(page.getByRole("heading", { name: originalTitle })).toBeVisible();

  const titleRow = page.getByLabel("タイトルの行。選択すると編集操作を表示します");
  await titleRow.hover();
  await titleRow.getByRole("button", { name: "タイトルを編集" }).click();
  await page.getByLabel("タイトルを入力").fill(updatedTitle);
  await page.getByTestId("inline-editable-picker").getByRole("button", { name: "更新" }).click();
  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
  await expect(page.getByText(new RegExp(`タイトルを ${originalTitle} から ${updatedTitle} に変更しました`))).toBeVisible();

  await page.getByLabel("コメント", { exact: true }).fill(ownComment);
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  const ownCommentCard = page.locator("article", { hasText: ownComment });
  await expect(ownCommentCard).toBeVisible();
  await expect(ownCommentCard.getByLabel("自分のコメントを編集")).toBeVisible();
  await expect(ownCommentCard.getByLabel("自分のコメントを削除")).toBeVisible();

  const otherUser = await registerWorkspaceMember(
    page,
    request,
    workspace.id,
    `e2e-task-detail-other-${suffix}`,
  );
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await login(otherPage, otherUser);
  const otherCommentResponse = await otherPage.request.post(
    `${API_BASE_URL}/api/tasks/${task.id}/comments`,
    {
      headers: await workspaceScopedHeaders(otherPage.request, workspace.id),
      data: { body: otherComment },
    },
  );
  expect(otherCommentResponse.status()).toBe(201);
  await otherContext.close();

  await page.reload();
  const otherCommentCard = page.locator("article", { hasText: otherComment });
  await expect(otherCommentCard).toBeVisible();
  await expect(otherCommentCard.getByLabel("自分のコメントを編集")).toHaveCount(0);
  await expect(otherCommentCard.getByLabel("自分のコメントを削除")).toHaveCount(0);

  const reloadedOwnCommentCard = page.locator("article", { hasText: ownComment });
  await reloadedOwnCommentCard.getByLabel("自分のコメントを編集").click();
  await page.getByPlaceholder("コメントを編集").fill(editedComment);
  await page.getByRole("button", { name: "更新", exact: true }).click();
  const editedCommentCard = page.locator("article", { hasText: editedComment });
  await expect(editedCommentCard.getByText("（編集済み）", { exact: true })).toBeVisible();

  const commentsResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tasks/${task.id}/timeline`) &&
      response.url().includes("filter=comments") &&
      response.status() === 200,
  );
  await page.getByRole("tab", { name: "コメント", exact: true }).click();
  await commentsResponse;
  await expect(page.getByText(editedComment, { exact: true })).toBeVisible();
  await expect(page.getByText(otherComment, { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`タイトルを ${originalTitle}`))).toHaveCount(0);

  const changesResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tasks/${task.id}/timeline`) &&
      response.url().includes("filter=changes") &&
      response.status() === 200,
  );
  await page.getByRole("tab", { name: "変更履歴", exact: true }).click();
  await changesResponse;
  await expect(page.getByText(new RegExp(`タイトルを ${originalTitle} から ${updatedTitle} に変更しました`))).toBeVisible();
  await expect(page.getByText(editedComment, { exact: true })).toHaveCount(0);
  await expect(page.getByText(otherComment, { exact: true })).toHaveCount(0);
});

test("論理削除済みタスクは詳細とタイムラインだけを参照できる", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `e2e-task-detail-deleted-${suffix}`;
  const comment = `e2e-deleted-comment-${suffix}`;
  const task = await createTask(page.request, workspace.id, title);
  const detailPath = `${workspacePagePath(workspace.id, "tasks")}/${task.id}`;

  await page.goto(detailPath);
  await page.getByLabel("コメント", { exact: true }).fill(comment);
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "タスクを削除" }).click();
  await page.getByRole("button", { name: "タスク削除を確定" }).click();
  await expect(page).toHaveURL(workspacePagePath(workspace.id, "tasks"));

  await page.goto(detailPath);
  await expect(page.getByText("削除済み", { exact: true })).toBeVisible();
  await expect(page.getByText("このタスクは削除されています。閲覧のみ可能です。")).toBeVisible();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "タスクを複製" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "タスクを削除" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /を編集/ })).toHaveCount(0);
  await expect(page.getByLabel("コメント", { exact: true })).toHaveCount(0);
});

test("カンバンの詳細モーダルはタイムラインを持たず詳細ページへ遷移できる", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `e2e-task-detail-modal-${suffix}`;
  const task = await createTask(page.request, workspace.id, title);
  const detailPath = `${workspacePagePath(workspace.id, "tasks")}/${task.id}`;

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  await page.getByRole("button", { name: /展開/ }).click();
  await page.locator(`.card[data-task-id="${task.id}"]`).click();

  const modal = page.locator(".task-detail-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByText("タイムライン", { exact: true })).toHaveCount(0);
  await expect(modal.getByLabel("コメント", { exact: true })).toHaveCount(0);
  await modal.getByRole("link", { name: "詳細ページを開く ↗", exact: true }).click();

  await expect(page).toHaveURL(detailPath);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("複製は指定フィールドを引き継ぎ初期状態の新規詳細へ遷移する", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const headers = await workspaceScopedHeaders(page.request, workspace.id);
  const meResponse = await page.request.get(`${API_BASE_URL}/api/auth/me`);
  expect(meResponse.ok()).toBeTruthy();
  const me = (await meResponse.json()) as { id: string; name: string };
  const caseResponse = await page.request.post(`${API_BASE_URL}/api/cases`, {
    headers,
    data: { name: `e2e-task-detail-dup-case-${suffix}`, templateOperations: [] },
  });
  expect(caseResponse.status()).toBe(201);
  const createdCase = (await caseResponse.json()) as { id: string; name: string };
  const parent = await createTask(page.request, workspace.id, `e2e-task-detail-dup-parent-${suffix}`);
  const sourceTitle = `e2e-task-detail-dup-source-${suffix}`;
  const source = await createTask(page.request, workspace.id, sourceTitle, {
    priority: "high",
    detail: `e2e-task-detail-dup-detail-${suffix}`,
    assigneeUserId: me.id,
    caseId: createdCase.id,
    isRequiredForCase: true,
    parentTaskId: parent.id,
    scheduledEndDate: "2036-08-20T00:00:00.000Z",
  });
  const stageResponse = await page.request.post(`${API_BASE_URL}/api/development-stages`, {
    headers,
    data: { name: `e2e-task-detail-dup-stage-${suffix}` },
  });
  expect(stageResponse.status()).toBe(201);
  const stage = (await stageResponse.json()) as { id: string; name: string };
  const stagePatch = await page.request.patch(
    `${API_BASE_URL}/api/tasks/${source.id}/development-stage`,
    { headers, data: { developmentStageId: stage.id } },
  );
  expect(stagePatch.status()).toBe(200);
  const statusPatch = await page.request.patch(`${API_BASE_URL}/api/tasks/${source.id}/status`, {
    headers,
    data: { status: "in_progress" },
  });
  expect(statusPatch.status()).toBe(200);
  const childTitle = `e2e-task-detail-dup-child-${suffix}`;
  const childResponse = await page.request.post(`${API_BASE_URL}/api/tasks/${source.id}/children`, {
    headers,
    data: { title: childTitle, priority: "low" },
  });
  expect(childResponse.status()).toBe(201);
  const commentBody = `e2e-task-detail-dup-comment-${suffix}`;
  const commentResponse = await page.request.post(`${API_BASE_URL}/api/tasks/${source.id}/comments`, {
    headers,
    data: { body: commentBody },
  });
  expect(commentResponse.status()).toBe(201);

  await page.goto(`${workspacePagePath(workspace.id, "tasks")}/${source.id}`);
  await expect(page.getByRole("heading", { name: sourceTitle })).toBeVisible();
  await page.getByRole("button", { name: "タスクを複製" }).click();

  await expect(page).not.toHaveURL(new RegExp(`/tasks/${source.id}(?:/|$)`));
  await expect(page).toHaveURL(new RegExp(`/workspaces/${workspace.id}/tasks/[\\w-]+$`));
  await expect(page.getByRole("heading", { name: sourceTitle })).toBeVisible();
  await expect(page.getByTestId("task-field-card").getByText("高", { exact: true })).toBeVisible();
  await expect(page.getByTestId("task-detail-display")).toContainText(`e2e-task-detail-dup-detail-${suffix}`);
  await expect(page.getByTestId("task-field-card").getByText(me.name)).toBeVisible();
  await expect(page.getByTestId("task-field-card").getByText(createdCase.name)).toBeVisible();
  await expect(page.getByTestId("task-field-card").getByText("必須", { exact: true })).toBeVisible();
  await expect(page.getByTestId("task-field-card").getByText("2036/08/20")).toBeVisible();
  await expect(page.getByTestId("task-field-card").getByText("未着手", { exact: true })).toBeVisible();
  await expect(page.getByTestId("task-field-card").getByText(stage.name)).toHaveCount(0);
  await expect(page.getByText(commentBody, { exact: true })).toHaveCount(0);
  await page.getByTestId("related-tasks-toggle").click();
  await expect(page.getByTestId("parent-task-link")).toHaveText(parent.title);
  await expect(page.getByText(childTitle, { exact: true })).toHaveCount(0);
});

test("削除済みタスクをカンバンのモーダルで開くと参照専用になる", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `e2e-task-detail-modal-deleted-${suffix}`;
  const task = await createTask(page.request, workspace.id, title);

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  await page.getByRole("button", { name: /展開/ }).click();
  await page.locator(`.card[data-task-id="${task.id}"]`).click();
  const modal = page.locator(".task-detail-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "編集", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "削除", exact: true })).toBeVisible();

  const deleteResponse = await page.request.delete(`${API_BASE_URL}/api/tasks/${task.id}`, {
    headers: await workspaceScopedHeaders(page.request, workspace.id),
  });
  expect(deleteResponse.status()).toBe(204);

  await modal.getByLabel("閉じる").click();
  await expect(modal).toBeHidden();
  await page.locator(`.card[data-task-id="${task.id}"]`).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByText("削除済み", { exact: true })).toBeVisible();
  await expect(modal.getByText("このタスクは参照専用です。編集・削除はできません。")).toBeVisible();
  await expect(modal.getByRole("button", { name: "編集", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "削除", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("link", { name: "詳細ページを開く ↗", exact: true })).toBeVisible();
});
