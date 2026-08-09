import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";
const PASSWORD = "e2e-password-123";

export type RegisteredUser = {
  email: string;
  name: string;
  password: string;
};

function createCredentials(name: string): RegisteredUser {
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
  return user;
}

export async function registerAndLogin(page: Page, name: string): Promise<RegisteredUser> {
  const user = createCredentials(name);

  await page.goto("/register");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("表示名").fill(user.name);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "登録", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  return user;
}

export async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const response = await request.get(`${API_BASE_URL}/api/auth/csrf`);
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json() as { token: string };
  return { "csrf-token": token };
}

type AuthFixtures = {
  authenticated: void;
};

export const test = base.extend<AuthFixtures>({
  authenticated: [
    async ({ page, request }, use, testInfo) => {
      await registerAndLogin(page, `e2e-session-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`);
      await registerUser(request, `e2e-api-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
