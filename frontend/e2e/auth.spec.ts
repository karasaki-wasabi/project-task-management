import { expect, test } from "@playwright/test";
import {
  createAndSelectWorkspace,
  registerUser,
  workspacePagePath,
  type RegisteredUser,
} from "./fixtures";

function uniqueUser(name: string): RegisteredUser {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: "",
    email: `auth-e2e-${unique}@example.test`,
    name,
    password: "e2e-password-123",
  };
}

async function registerFromPage(
  page: import("@playwright/test").Page,
  user: RegisteredUser,
): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("表示名").fill(user.name);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "登録", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test("登録後のランディングに表示名を表示する", async ({ page }) => {
  const user = uniqueUser("E2E 登録ユーザー");

  await registerFromPage(page, user);

  await expect(page).toHaveURL("/");
  await expect(page.locator("header")).toContainText(user.name);
});

test("ログイン失敗時に固定のエラーメッセージを表示する", async ({ page, request }) => {
  const user = await registerUser(request, "E2E ログインユーザー");

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();

  await expect(page.getByText("メールアドレスまたはパスワードが正しくありません。")).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("ログアウト後は業務画面へアクセスできない", async ({ page }) => {
  const user = uniqueUser("E2E ログアウトユーザー");

  await registerFromPage(page, user);
  const workspace = await createAndSelectWorkspace(page, `e2e-logout-ws-${Date.now()}`);
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL("/login");

  const target = workspacePagePath(workspace.id, "tasks");
  await page.goto(target);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(target);
});

test("未ログインで scoped tasks へアクセス後、ログインすると元の画面へ戻る", async ({
  page,
  request,
}) => {
  const user = await registerUser(request, "E2E リダイレクトユーザー");

  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/");

  const workspace = await createAndSelectWorkspace(page, `e2e-redirect-ws-${Date.now()}`);
  const target = `${workspacePagePath(workspace.id, "tasks")}?caseId=c1`;
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL("/login");

  await page.goto(target);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();

  await expect(page).toHaveURL(target);
});

test("担当者候補に自己登録アカウントの表示名を表示する", async ({ page }) => {
  const user = uniqueUser("E2E 担当者候補ユーザー");

  await registerFromPage(page, user);
  const workspace = await createAndSelectWorkspace(page, `e2e-auth-ws-${Date.now()}`);
  await page.goto(workspacePagePath(workspace.id, "tasks"));

  await expect(page.locator("select").filter({ hasText: "すべて" })).toContainText(user.name);
  await expect(page.locator("form select").last()).toContainText(user.name);
});
