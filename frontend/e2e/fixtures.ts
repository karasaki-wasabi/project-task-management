import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";
const PASSWORD = "e2e-password-123";

export type RegisteredUser = {
  id: string;
  email: string;
  name: string;
  password: string;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
};

function createCredentials(name: string): Omit<RegisteredUser, "id"> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    email: `e2e-${unique}@example.test`,
    name,
    password: PASSWORD,
  };
}

export async function registerUser(request: APIRequestContext, name: string): Promise<RegisteredUser> {
  const user = createCredentials(name);
  const response = await request.post(`${API_BASE_URL}/api/auth/register`, { data: user });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id: string };
  return { ...user, id: body.id };
}

export async function registerAndLogin(page: Page, name: string): Promise<RegisteredUser> {
  const user = createCredentials(name);

  await page.goto("/register");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("表示名").fill(user.name);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "登録", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Registration response is not available here; id is unused by callers that only need a session.
  return { ...user, id: "" };
}

export async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const response = await request.get(`${API_BASE_URL}/api/auth/csrf`);
  expect(response.ok()).toBeTruthy();
  const { token } = (await response.json()) as { token: string };
  return { "csrf-token": token };
}

/** CSRF + X-Workspace-Id for scoped API helpers (cases/tasks/templates/…). */
export async function workspaceScopedHeaders(
  request: APIRequestContext,
  workspaceId: string,
): Promise<Record<string, string>> {
  return {
    ...(await csrfHeaders(request)),
    "x-workspace-id": workspaceId,
  };
}

/**
 * Create a workspace via the real UI and leave it selected
 * (`localStorage.currentWorkspaceId` + header switcher).
 * Intended for a freshly registered user with zero memberships.
 */
export async function createAndSelectWorkspace(page: Page, name: string): Promise<WorkspaceInfo> {
  await page.goto("/workspaces");
  await expect(page.getByTestId("workspace-empty-state")).toBeVisible();
  await page.getByRole("button", { name: "ワークスペースを作成", exact: true }).click();
  const createModal = page.getByRole("dialog", { name: "ワークスペースを作成" });
  await expect(createModal).toBeVisible();
  await createModal.locator("#workspace-create-name").fill(name);
  await createModal.getByRole("button", { name: "作成", exact: true }).click();
  await expect(createModal).toBeHidden();
  await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(name);

  const id = await page.evaluate(() => localStorage.getItem("currentWorkspaceId"));
  expect(id).toBeTruthy();
  return { id: id!, name };
}

/** Add a registered user to a workspace using the page's authenticated session. */
export async function addWorkspaceMember(
  page: Page,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const response = await page.request.post(`${API_BASE_URL}/api/workspaces/${workspaceId}/members`, {
    headers: await csrfHeaders(page.request),
    data: { userId },
  });
  expect(response.status()).toBe(201);
}

/** Register a user via API and add them as a member of the current workspace. */
export async function registerWorkspaceMember(
  page: Page,
  request: APIRequestContext,
  workspaceId: string,
  name: string,
): Promise<RegisteredUser> {
  const user = await registerUser(request, name);
  await addWorkspaceMember(page, workspaceId, user.id);
  return user;
}

type AuthFixtures = {
  authenticated: void;
};

/**
 * Login-only fixture. Use for specs that assert the zero-workspace empty
 * state (e.g. workspaces.spec.ts). Case/task specs should use `test` instead.
 */
export const authTest = base.extend<AuthFixtures>({
  authenticated: [
    async ({ page, request }, use, testInfo) => {
      await registerAndLogin(page, `e2e-session-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`);
      await registerUser(request, `e2e-api-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`);
      await use();
    },
    { auto: true },
  ],
});

/**
 * Default E2E fixture: authenticated session + a created/selected workspace
 * (workspace-resource-scope task 10.1). Specs receive `workspace: { id, name }`.
 */
export const test = authTest.extend<{ workspace: WorkspaceInfo }>({
  workspace: [
    async ({ page }, use, testInfo) => {
      const workspace = await createAndSelectWorkspace(
        page,
        `e2e-ws-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Date.now()}`,
      );
      await use(workspace);
    },
    { auto: true },
  ],
});

export { expect };
