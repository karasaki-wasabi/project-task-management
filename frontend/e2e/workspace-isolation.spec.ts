// E2E: cross-workspace data invisibility (task 10.2, design.md Testing
// Strategy "E2E/UI Tests", Requirements 3.1, 3.2, 3.3, 3.4).
// Two workspaces / two users: a member of A must not see B's cases/tasks
// in lists, via deep-link URL, or via get-by-id; non-member workspace
// header must be rejected. Requires backend (+MySQL) and frontend via
// `docker compose up`; see playwright.config.ts.
import type { APIRequestContext } from "@playwright/test";
import {
  authTest as test,
  createAndSelectWorkspace,
  expect,
  registerAndLogin,
  workspaceScopedHeaders,
  workspacePagePath,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

async function createCase(
  request: APIRequestContext,
  workspaceId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_BASE_URL}/api/cases`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: { name, templateOperations: [] },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function createTask(
  request: APIRequestContext,
  workspaceId: string,
  title: string,
  caseId: string,
): Promise<{ id: string; title: string }> {
  const response = await request.post(`${API_BASE_URL}/api/tasks`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: { title, priority: "medium", caseId },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; title: string };
}

test("所属外ワークスペースの案件・タスクは一覧にもURL直接操作でも到達できない (Requirements 3.1-3.4)", async ({
  page,
  workspace,
  browser,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const caseAName = `e2e-iso-case-a-${suffix}`;
  const caseBName = `e2e-iso-case-b-${suffix}`;
  const taskATitle = `e2e-iso-task-a-${suffix}`;
  const taskBTitle = `e2e-iso-task-b-${suffix}`;

  // --- Workspace A (current session; member of A only) ---
  const workspaceA = await createAndSelectWorkspace(page, `e2e-iso-ws-a-${suffix}`);
  const caseA = await createCase(page.request, workspaceA.id, caseAName);
  const taskA = await createTask(page.request, workspaceA.id, taskATitle, caseA.id);

  // --- Workspace B (separate user; member of B only) ---
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await registerAndLogin(pageB, `e2e-iso-user-b-${suffix}`);
  const workspaceB = await createAndSelectWorkspace(pageB, `e2e-iso-ws-b-${suffix}`);
  const caseB = await createCase(pageB.request, workspaceB.id, caseBName);
  const taskB = await createTask(pageB.request, workspaceB.id, taskBTitle, caseB.id);
  await contextB.close();

  // --- List: only current-workspace resources (Requirement 3.1) ---
  await page.goto(workspacePagePath(workspace.id, "cases"));
  const searchBox = page.getByPlaceholder("案件名で絞り込み");
  await searchBox.fill(caseBName);
  await expect(page.locator("tbody tr", { hasText: caseBName })).toHaveCount(0);
  await searchBox.fill(caseAName);
  await expect(page.locator("tbody tr", { hasText: caseAName })).toBeVisible();

  await page.goto(workspacePagePath(workspace.id, "tasks"));
  await expect(page.locator("li", { hasText: taskBTitle })).toHaveCount(0);
  await expect(page.locator("li", { hasText: taskATitle }).first()).toBeVisible();

  // --- Deep-link URL must not surface foreign workspace data (Requirement 3.3) ---
  await page.goto(`${workspacePagePath(workspace.id, "tasks")}?caseId=${caseB.id}`);
  await expect(page.locator("li", { hasText: taskBTitle })).toHaveCount(0);

  // Own resource remains reachable (Requirement 3.2).
  // Cases expose get-by-id via /progress (no bare GET /api/cases/:id).
  const ownCaseList = await page.request.get(`${API_BASE_URL}/api/cases`, {
    headers: { "x-workspace-id": workspaceA.id },
  });
  expect(ownCaseList.status()).toBe(200);
  const listedCases = (await ownCaseList.json()) as Array<{ id: string; name: string }>;
  expect(listedCases.some((item) => item.id === caseA.id && item.name === caseAName)).toBeTruthy();

  const ownCaseProgress = await page.request.get(
    `${API_BASE_URL}/api/cases/${caseA.id}/progress`,
    { headers: { "x-workspace-id": workspaceA.id } },
  );
  expect(ownCaseProgress.status()).toBe(200);

  const ownTask = await page.request.get(`${API_BASE_URL}/api/tasks/${taskA.id}`, {
    headers: { "x-workspace-id": workspaceA.id },
  });
  expect(ownTask.status()).toBe(200);
  await expect(ownTask.json()).resolves.toMatchObject({ id: taskA.id, title: taskATitle });

  // Foreign resource id under current workspace → 404 (Requirement 3.3; hide existence)
  const foreignCase = await page.request.get(`${API_BASE_URL}/api/cases/${caseB.id}/progress`, {
    headers: { "x-workspace-id": workspaceA.id },
  });
  expect(foreignCase.status()).toBe(404);

  const foreignTask = await page.request.get(`${API_BASE_URL}/api/tasks/${taskB.id}`, {
    headers: { "x-workspace-id": workspaceA.id },
  });
  expect(foreignTask.status()).toBe(404);

  // Non-member workspace header → 403 (Requirement 3.4)
  const nonMemberList = await page.request.get(`${API_BASE_URL}/api/cases`, {
    headers: { "x-workspace-id": workspaceB.id },
  });
  expect(nonMemberList.status()).toBe(403);

  const nonMemberGet = await page.request.get(`${API_BASE_URL}/api/cases/${caseB.id}/progress`, {
    headers: { "x-workspace-id": workspaceB.id },
  });
  expect(nonMemberGet.status()).toBe(403);
});
