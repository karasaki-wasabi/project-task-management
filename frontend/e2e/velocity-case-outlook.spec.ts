// E2E: CaseOutlookPanel 「算出不可」分岐
// (velocity-dashboard 7.3; Requirements 6.3, 7.4, 7.5).
//
// Run (CORS_ORIGIN と揃える。127.0.0.1 だと登録が Failed to fetch になる):
//   E2E_BASE_URL=http://localhost:3401 E2E_API_BASE_URL=http://localhost:3400 \
//     npm run test:e2e -- e2e/velocity-case-outlook.spec.ts
import type { APIRequestContext } from "@playwright/test";
import {
  expect,
  test,
  workspacePagePath,
  workspaceScopedHeaders,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

const UNAVAILABLE = "算出不可";

test.setTimeout(60_000);

async function createCase(
  request: APIRequestContext,
  workspaceId: string,
  name: string,
  opts: { endDate?: string } = {},
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_BASE_URL}/api/cases`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: {
      name,
      ...(opts.endDate ? { endDate: opts.endDate } : {}),
      templateOperations: [],
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; name: string };
}

async function selectCaseFilter(page: import("@playwright/test").Page, optionLabel: string) {
  await page.getByTestId("case-filter-trigger").click();
  await expect(page.getByRole("listbox", { name: "案件候補" })).toBeVisible();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/** Force rangeCount=1 so forecast is insufficient (need ≥2 periods). */
async function applyInsufficientRange(page: import("@playwright/test").Page) {
  const rangeInput = page.getByLabel("表示件数");
  await rangeInput.fill("1");
  const load = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      /\/api\/throughput/.test(res.url()) &&
      /[?&]rangeCount=1(?:&|$)/.test(res.url()) &&
      res.ok(),
  );
  await page.getByRole("button", { name: "表示", exact: true }).click();
  await load;
}

test("終了日未設定の案件では残期間・必要期間・余力が算出不可 (Requirements 7.4)", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const caseName = `e2e-outlook-no-end-${suffix}`;

  await createCase(page.request, workspace.id, caseName);

  await page.goto(workspacePagePath(workspace.id, "throughput"));
  await expect(page.getByRole("heading", { name: "消化数ダッシュボード" })).toBeVisible();

  const selectResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      /\/api\/throughput/.test(res.url()) &&
      res.url().includes("caseId=") &&
      res.ok(),
  );
  await selectCaseFilter(page, caseName);
  await selectResponse;

  const panel = page.getByTestId("case-outlook-panel");
  await expect(panel).toBeVisible();

  // Open counts remain numeric (not 算出不可).
  await expect(page.getByTestId("outlook-open-task-count")).toHaveText(/^\d+\s*件$/);
  await expect(page.getByTestId("outlook-open-points")).toHaveText(/^\d+\s*pt$/);
  await expect(page.getByTestId("outlook-open-task-count")).not.toContainText(UNAVAILABLE);
  await expect(page.getByTestId("outlook-open-points")).not.toContainText(UNAVAILABLE);

  // No endDate → remaining / required / margin all unavailable.
  await expect(page.getByTestId("outlook-remaining-periods")).toHaveText(UNAVAILABLE);
  await expect(page.getByTestId("outlook-required-periods")).toHaveText(UNAVAILABLE);
  await expect(page.getByTestId("outlook-margin-points")).toHaveText(UNAVAILABLE);
});

test("終了日あり・実績不足では必要期間・余力のみ算出不可で残期間は表示 (Requirements 6.3, 7.5)", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const caseName = `e2e-outlook-end-insuff-${suffix}`;

  await createCase(page.request, workspace.id, caseName, {
    endDate: "2030-12-31T00:00:00.000Z",
  });

  await page.goto(workspacePagePath(workspace.id, "throughput"));
  await expect(page.getByRole("heading", { name: "消化数ダッシュボード" })).toBeVisible();

  await applyInsufficientRange(page);
  await expect(page.getByTestId("forecast-insufficient")).toBeVisible();

  const selectResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      /\/api\/throughput/.test(res.url()) &&
      res.url().includes("caseId=") &&
      /[?&]rangeCount=1(?:&|$)/.test(res.url()) &&
      res.ok(),
  );
  await selectCaseFilter(page, caseName);
  await selectResponse;

  await expect(page.getByTestId("case-outlook-panel")).toBeVisible();
  await expect(page.getByTestId("forecast-insufficient")).toBeVisible();

  // Open counts still shown.
  await expect(page.getByTestId("outlook-open-task-count")).toHaveText(/^\d+\s*件$/);
  await expect(page.getByTestId("outlook-open-points")).toHaveText(/^\d+\s*pt$/);

  // endDate set → remainingPeriods is a numeric period label (not 算出不可).
  const remaining = page.getByTestId("outlook-remaining-periods");
  await expect(remaining).not.toHaveText(UNAVAILABLE);
  await expect(remaining).toHaveText(/\d+(\.\d+)?\s*(週|月)/);

  // Insufficient forecast → required / margin unavailable.
  await expect(page.getByTestId("outlook-required-periods")).toHaveText(UNAVAILABLE);
  await expect(page.getByTestId("outlook-margin-points")).toHaveText(UNAVAILABLE);
});
