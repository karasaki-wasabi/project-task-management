// E2E: workspace critical path (task 7.2, design.md Testing Strategy "E2E/UI Tests",
// Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 6.1, 6.3, 7.1, 7.4).
// Flow: empty → create → header switch → member search/add → settings → creator delete.
// Requires backend (+MySQL) and frontend via `docker compose up`; see playwright.config.ts.
import { authTest as test, expect, registerUser } from "./fixtures";

const ALT_COLOR = "#0f766e";

test("ワークスペースのクリティカルパスを一通り操作できる (Requirements 1.1-1.3, 2.1-2.3, 6.1, 6.3, 7.1, 7.4)", async ({
  page,
  request,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceA = `e2e-ws-a-${suffix}`;
  const workspaceB = `e2e-ws-b-${suffix}`;
  const renamedB = `e2e-ws-b-renamed-${suffix}`;
  const member = await registerUser(request, `e2e-ws-member-${suffix}`);

  // --- 0件: 空状態 ---
  await page.goto("/workspaces");
  await expect(page.getByTestId("workspace-empty-state")).toBeVisible();
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText("ワークスペース未選択");

  // --- 作成 A（空状態 CTA）→ 自動選択 ---
  await page.getByRole("button", { name: "ワークスペースを作成", exact: true }).click();
  const createModal = page.getByRole("dialog", { name: "ワークスペースを作成" });
  await expect(createModal).toBeVisible();
  await createModal.locator("#workspace-create-name").fill(workspaceA);
  await createModal.getByRole("button", { name: "作成", exact: true }).click();
  await expect(createModal).toBeHidden();

  await expect(page.getByTestId("workspace-heading")).toContainText(workspaceA);
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(workspaceA);
  await expect(page.getByTestId("member-name")).toHaveCount(1);

  // --- 作成 B（ヘッダースイッチャー）→ 切替 ---
  await page.getByTestId("workspace-switcher-trigger").click();
  await page.getByRole("button", { name: "＋ ワークスペースを作成", exact: true }).click();
  await expect(createModal).toBeVisible();
  await createModal.locator("#workspace-create-name").fill(workspaceB);
  await createModal.getByRole("button", { name: "作成", exact: true }).click();
  await expect(createModal).toBeHidden();

  await expect(page.getByTestId("workspace-heading")).toContainText(workspaceB);
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(workspaceB);

  // A へ切替
  await page.getByTestId("workspace-switcher-trigger").click();
  await page.getByRole("option", { name: workspaceA }).click();
  await expect(page.getByTestId("workspace-heading")).toContainText(workspaceA);
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(workspaceA);

  // B へ戻して localStorage 保持を確認
  await page.getByTestId("workspace-switcher-trigger").click();
  await page.getByRole("option", { name: workspaceB }).click();
  await expect(page.getByTestId("workspace-heading")).toContainText(workspaceB);

  await page.reload();
  await expect(page.getByTestId("workspace-heading")).toContainText(workspaceB);
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(workspaceB);

  // --- メンバー検索・追加 ---
  await page.getByRole("button", { name: "メンバーを追加", exact: true }).click();
  await expect(page.getByTestId("member-search-panel")).toBeVisible();
  await page.getByTestId("member-search-input").fill(member.name);
  const searchRow = page
    .locator("li")
    .filter({ has: page.getByTestId("search-result-name").filter({ hasText: member.name }) });
  await expect(searchRow.getByTestId("search-result-email")).toContainText(member.email);
  await searchRow.getByTestId("add-member-button").click();

  await expect(page.getByTestId("member-name").filter({ hasText: member.name })).toBeVisible();
  await expect(page.getByText("メンバー 2人")).toBeVisible();

  // 再検索で追加済みユーザーが除外される
  await page.getByTestId("member-search-input").fill("");
  await page.getByTestId("member-search-input").fill(member.name);
  await expect(page.getByTestId("member-search-empty")).toBeVisible();

  // --- 設定変更（名前・識別色）---
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const settingsModal = page.getByRole("dialog", { name: "ワークスペース設定" });
  await expect(settingsModal).toBeVisible();
  await settingsModal.locator("#workspace-settings-name").fill(renamedB);
  await settingsModal
    .locator(`[data-testid="workspace-color-swatch"][data-color="${ALT_COLOR}"]`)
    .click();
  await settingsModal.getByRole("button", { name: "保存", exact: true }).click();
  await expect(settingsModal).toBeHidden();

  await expect(page.getByTestId("workspace-heading")).toContainText(renamedB);
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(renamedB);
  await expect(page.getByTestId("workspace-heading").getByTestId("workspace-color-dot")).toHaveCSS(
    "background-color",
    "rgb(15, 118, 110)",
  );

  // --- 作成者による削除 ---
  await expect(page.getByTestId("workspace-delete-button")).toBeVisible();
  await page.getByTestId("workspace-delete-button").click();
  const deleteModal = page.getByRole("dialog", { name: "ワークスペースの削除確認" });
  await expect(deleteModal).toBeVisible();
  await deleteModal.getByTestId("workspace-delete-confirm").click();
  await expect(deleteModal).toBeHidden();

  // 削除済み B は一覧から消え、残存 A が現在選択になる（useCurrentWorkspace の先頭自動選択）
  await expect(page.getByTestId("workspace-heading")).toContainText(workspaceA);
  await page.getByTestId("workspace-switcher-trigger").click();
  await expect(page.getByRole("option", { name: workspaceA })).toBeVisible();
  await expect(page.getByRole("option", { name: renamedB })).toHaveCount(0);
  // ドロップダウンを閉じる（外側クリック）
  await page.locator("main").click({ position: { x: 8, y: 8 } });

  // 最後のワークスペースを削除すると空状態へ戻る（Requirement 7.4）
  await page.getByTestId("workspace-delete-button").click();
  await expect(deleteModal).toBeVisible();
  await deleteModal.getByTestId("workspace-delete-confirm").click();
  await expect(deleteModal).toBeHidden();
  await expect(page.getByTestId("workspace-empty-state")).toBeVisible();
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText("ワークスペース未選択");
});
