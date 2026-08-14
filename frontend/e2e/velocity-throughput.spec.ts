// E2E: case filter toggle + insufficient forecast on throughput dashboard
// (velocity-dashboard 7.2; Requirements 4.1, 4.2, 4.3, 5.1, 5.2, 6.3).
//
// Run (CORS_ORIGIN と揃える。127.0.0.1 だと登録が Failed to fetch になる):
//   E2E_BASE_URL=http://localhost:3401 E2E_API_BASE_URL=http://localhost:3400 \
//     npm run test:e2e -- e2e/velocity-throughput.spec.ts
import type { APIRequestContext } from "@playwright/test";
import {
  expect,
  test,
  workspacePagePath,
  workspaceScopedHeaders,
} from "./fixtures";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";

const FORECAST_INSUFFICIENT_MESSAGE =
  "実績データ不足のため、今後の目安（完了タスク数・完了ストーリーポイント）は表示できません。2 期間以上の実績が集まると表示されます。";

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

test("案件フィルタ切替で見通しパネルが出し分けられ、実績不足案内を表示する (Requirements 4.1-4.3, 5.1-5.2, 6.3)", async ({
  page,
  workspace,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const caseName = `e2e-tp-case-${suffix}`;

  await createCase(page.request, workspace.id, caseName, {
    endDate: "2030-12-31T00:00:00.000Z",
  });

  await page.goto(workspacePagePath(workspace.id, "throughput"));
  await expect(page.getByRole("heading", { name: "消化数ダッシュボード" })).toBeVisible();
  await expect(page.getByTestId("workspace-empty-state")).toHaveCount(0);

  // Default: workspace-wide scope (no case filter). Chart loads with default range.
  await expect(page.getByTestId("case-filter-trigger")).toContainText("全体(ワークスペース)");
  await expect(page.getByTestId("throughput-trend-chart")).toBeVisible();
  await expect(page.getByTestId("case-outlook-panel")).toHaveCount(0);

  // Fewer than 2 periods → forecast cards become the insufficient-data notice.
  const rangeInput = page.getByLabel("表示件数");
  const insufficientLoad = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      /\/api\/throughput/.test(res.url()) &&
      /[?&]rangeCount=1(?:&|$)/.test(res.url()) &&
      !res.url().includes("caseId=") &&
      res.ok(),
  );
  await rangeInput.fill("1");
  await insufficientLoad;

  await expect(page.getByTestId("throughput-trend-chart")).toBeVisible();
  await expect(page.getByTestId("forecast-insufficient")).toBeVisible();
  await expect(page.getByTestId("forecast-insufficient")).toContainText(
    FORECAST_INSUFFICIENT_MESSAGE,
  );
  await expect(page.getByTestId("forecast-summary")).toHaveCount(0);

  // Select a case → outlook panel appears; chart stays; forecast still insufficient.
  const selectResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      /\/api\/throughput/.test(res.url()) &&
      res.url().includes("caseId=") &&
      res.ok(),
  );
  await selectCaseFilter(page, caseName);
  await selectResponse;

  await expect(page.getByTestId("case-filter-trigger")).toContainText(caseName);
  await expect(page.getByTestId("throughput-trend-chart")).toBeVisible();
  await expect(page.getByTestId("case-outlook-panel")).toBeVisible();
  await expect(page.getByTestId("forecast-insufficient")).toBeVisible();
  await expect(page.getByTestId("forecast-insufficient")).toContainText(
    FORECAST_INSUFFICIENT_MESSAGE,
  );
  await expect(page.getByTestId("forecast-summary")).toHaveCount(0);
  await expect(page.getByTestId("workspace-empty-state")).toHaveCount(0);

  // Clear filter → workspace-wide again; outlook hidden; insufficient notice remains.
  const clearResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      /\/api\/throughput/.test(res.url()) &&
      !res.url().includes("caseId=") &&
      res.ok(),
  );
  await selectCaseFilter(page, "全体(ワークスペース)");
  await clearResponse;

  await expect(page.getByTestId("case-filter-trigger")).toContainText("全体(ワークスペース)");
  await expect(page.getByTestId("throughput-trend-chart")).toBeVisible();
  await expect(page.getByTestId("case-outlook-panel")).toHaveCount(0);
  await expect(page.getByTestId("forecast-insufficient")).toBeVisible();
  await expect(page.getByTestId("forecast-insufficient")).toContainText(
    FORECAST_INSUFFICIENT_MESSAGE,
  );
  await expect(page.getByTestId("workspace-empty-state")).toHaveCount(0);
});
