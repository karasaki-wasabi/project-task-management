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
): Promise<{ id: string; title: string }> {
  const response = await request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: { title, priority: "medium" },
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
  await page.getByTestId("inline-editable-picker").getByRole("button", { name: "保存" }).click();
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
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const editedCommentCard = page.locator("article", { hasText: editedComment });
  await expect(editedCommentCard.getByText("編集済み", { exact: true })).toBeVisible();

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
  await expect(page.getByText("このタスクは参照専用です。")).toBeVisible();
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
