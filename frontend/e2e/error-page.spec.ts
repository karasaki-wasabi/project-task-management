// E2E: routing 404 (unknown / non-member workspace) shows the common
// error page, and 「ホームへ戻る」 returns to the app (Requirement 4.1).
import { randomUUID } from "node:crypto";
import { expect, test, workspacePagePath } from "./fixtures";

test("存在しないワークスペースへアクセスすると共通エラーページが表示され、ホームへ戻れる (Requirement 4.1)", async ({
  page,
  workspace,
}) => {
  const missingWorkspaceId = randomUUID();
  expect(missingWorkspaceId).not.toBe(workspace.id);

  await page.goto(workspacePagePath(missingWorkspaceId));

  const errorHeading = page.getByRole("heading", { name: "お探しのページが見つかりません" });
  await expect(errorHeading).toBeVisible();

  await page.getByRole("button", { name: "ホームへ戻る" }).click();

  await expect(errorHeading).toBeHidden();
  await expect(page.getByTestId("workspace-switcher-trigger")).toBeVisible();
});
