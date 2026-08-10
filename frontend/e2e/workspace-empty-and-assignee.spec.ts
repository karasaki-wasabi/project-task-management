// E2E: workspace-unselected empty state on 8 scoped pages + assignee
// candidate restriction (task 10.3, design.md Testing Strategy "E2E/UI Tests",
// Requirements 2.1, 2.2, 4.1, 4.2).
// Empty-state uses authTest (no auto workspace). Assignee uses default `test`
// (workspace created/selected). Requires backend (+MySQL) and frontend via
// `docker compose up`; see playwright.config.ts.
import {
  authTest,
  expect,
  registerUser,
  registerWorkspaceMember,
  test,
  workspaceScopedHeaders,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

/** Pages that must gate on current workspace (Requirements 2.1, 2.2). */
const SCOPED_PAGES = [
  "/",
  "/cases",
  "/tasks",
  "/kanban",
  "/calendar",
  "/recurrence",
  "/holidays",
  "/throughput",
] as const;

authTest(
  "現在ワークスペース未選択では対象8画面に空状態と作成誘導が出る (Requirements 2.1, 2.2)",
  async ({ page }) => {
    for (const path of SCOPED_PAGES) {
      await page.goto(path);
      const empty = page.getByTestId("workspace-empty-state");
      await expect(empty).toBeVisible();
      await expect(empty.getByRole("heading", { name: "ワークスペースがありません" })).toBeVisible();
      // Create CTA must point at workspace management (task 7.2 / design.md).
      await expect(empty.getByRole("link", { name: "ワークスペースを作成" })).toHaveAttribute(
        "href",
        "/workspaces",
      );
      // List/create chrome must not appear while ungated empty state shows.
      await expect(page.getByRole("button", { name: "案件を登録" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "タスク登録" })).toHaveCount(0);
    }

    // One navigation proof: CTA lands on /workspaces.
    await page.goto("/tasks");
    await page
      .getByTestId("workspace-empty-state")
      .getByRole("link", { name: "ワークスペースを作成" })
      .click();
    await expect(page).toHaveURL(/\/workspaces$/);
  },
);

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

  await page.goto("/tasks");
  await expect(page.getByTestId("workspace-empty-state")).toHaveCount(0);

  // Create-form assignee <select> is the last select in the create form
  // (priority then assignee; see pages/tasks/index.vue).
  const createForm = page.locator("form").filter({ has: page.getByPlaceholder("タスク名") });
  const assigneeSelect = createForm.locator("select").last();

  await expect(assigneeSelect).toContainText(memberName);
  await expect(assigneeSelect).not.toContainText(outsiderName);

  const optionValues = await assigneeSelect.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter((value) => value !== ""),
  );
  expect(optionValues).toContain(member.id);
  expect(optionValues).not.toContain(outsider.id);

  // Requirement 4.2: API rejects non-member assignee even if client bypasses UI.
  const rejected = await page.request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(page.request, workspace.id),
    data: {
      title: `e2e-reject-outsider-${suffix}`,
      priority: "medium",
      assigneeUserId: outsider.id,
    },
  });
  expect(rejected.status()).toBe(400);

  // Member assignee is accepted.
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
