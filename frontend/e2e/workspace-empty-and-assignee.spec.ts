// E2E: zero-membership landing, old flat URL 404, assignee candidates
// (workspace-url-routing 6.2 + workspace-resource-scope assignee).
import {
  authTest,
  expect,
  registerUser,
  registerWorkspaceMember,
  test,
  workspacePagePath,
  workspaceScopedHeaders,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

const OLD_FLAT_PAGES = [
  "/tasks",
  "/kanban",
  "/cases",
  "/calendar",
  "/recurrence",
  "/holidays",
  "/throughput",
] as const;

authTest("所属ゼロでは / に一覧・追加（Picker）が出る (Requirements 2.1, 2.2, 8.1)", async ({
  page,
}) => {
  await page.goto("/");
  const empty = page.getByTestId("workspace-empty-state");
  await expect(empty).toBeVisible();
  await expect(empty.getByRole("heading", { name: "ワークスペースがありません" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ワークスペースを作成", exact: true })).toBeVisible();
});

authTest("旧フラット業務 URL は404になる (Requirement 5.2)", async ({ page }) => {
  for (const path of OLD_FLAT_PAGES) {
    await page.goto(path);
    await expect(page.getByText(/404|Page not found/i).first()).toBeVisible();
  }
});

authTest("非所属の workspaceId は404になる (Requirement 5.1)", async ({ page }) => {
  await page.goto("/workspaces/00000000-0000-4000-8000-000000000099/tasks");
  await expect(page.getByText(/404|Page not found/i).first()).toBeVisible();
});

test("タスク作成の担当者候補は現在ワークスペースのメンバーのみ (Requirements 4.1, 4.2)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const memberName = `e2e-assignee-member-${suffix}`;
  const outsiderName = `e2e-assignee-outsider-${suffix}`;

  const member = await registerWorkspaceMember(page, request, workspace.id, memberName);
  const outsider = await registerUser(request, outsiderName);

  await page.goto(workspacePagePath(workspace.id, "tasks"));

  const createForm = page.locator("form").filter({ has: page.getByPlaceholder("タスク名") });
  const assigneeSelect = createForm.locator("select").last();

  await expect(assigneeSelect).toContainText(memberName);
  await expect(assigneeSelect).not.toContainText(outsiderName);

  const optionValues = await assigneeSelect.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter((value) => value !== ""),
  );
  expect(optionValues).toContain(member.id);
  expect(optionValues).not.toContain(outsider.id);

  const rejected = await page.request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(page.request, workspace.id),
    data: {
      title: `e2e-reject-outsider-${suffix}`,
      priority: "medium",
      assigneeUserId: outsider.id,
    },
  });
  expect(rejected.status()).toBe(400);

  const accepted = await page.request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(page.request, workspace.id),
    data: {
      title: `e2e-accept-member-${suffix}`,
      priority: "medium",
      assigneeUserId: member.id,
    },
  });
  expect(accepted.status()).toBe(201);
});
