// E2E: negative-assertion regression check for the non-task-event feature's
// complete removal (task 6.2, Requirements 7.1, 7.2, 8.1).
//
// task-case-calendar removed the old task/event unified timeline
// (`/events`) in favor of the new `/calendar` screen, and deleted the
// non-task-event feature outright (backend Event model/routes: tasks
// 1.1-1.5; frontend useApiClient events methods + /events page: tasks
// 2.1-2.2; dashboard's "直近のイベント" section: task 2.2; global nav entry:
// task 5.1). Those tasks each verified their own slice manually or via
// scoped tests; this spec is the single codified regression check proving
// no trace of the feature remains reachable across all three surfaces named
// in the requirements (旧`/events`パス、グローバルナビゲーション、ダッシュボード),
// plus a defense-in-depth backend check.
//
// This file intentionally only makes negative assertions ("X is not
// present"). Positive assertions for the replacement calendar feature live
// in calendar.spec.ts (task 6.1) and are out of this file's scope.
import {
  expect,
  test,
} from "./fixtures";

test("old /events path does not render the former timeline UI (Requirement 7.2)", async ({ page }) => {
  await page.goto("/events");

  // The app is an SPA (ssr: false) with no `frontend/pages/events` route and
  // no custom error page, so Nuxt's client router falls through to its
  // built-in NuxtErrorPage for any unmatched path. Assert both sides: the
  // deleted page's distinctive content is gone, and Nuxt's own not-found
  // signal is what actually replaced it (not e.g. a blank page or a crash,
  // either of which would also make the "not visible" assertion below
  // vacuously true).
  await expect(page.getByText(/404|Page not found/i).first()).toBeVisible();

  // Distinctive content from the old /events timeline page must not exist
  // anywhere on the page.
  await expect(page.getByRole("button", { name: "イベント登録" })).toHaveCount(0);
  await expect(page.getByText("イベント登録")).toHaveCount(0);
  await expect(page.getByText("直近のイベント")).toHaveCount(0);
});

test("global navigation has no non-task-event entry and does list カレンダー (Requirement 7.2)", async ({
  page,
  workspace,
}) => {
  await page.goto(`/workspaces/${workspace.id}`);

  const nav = page.locator("nav").first();
  await expect(nav).toBeVisible();

  // The old nav entry was `{ to: "/events", label: "タイムライン" }`
  // (replaced in task 5.1 by calendar; workspace-url-routing scopes the href).
  await expect(nav.getByRole("link", { name: "タイムライン" })).toHaveCount(0);
  await expect(nav.locator('a[href="/events"]')).toHaveCount(0);
  await expect(nav.getByText("タイムライン")).toHaveCount(0);

  await expect(nav.getByRole("link", { name: "カレンダー" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "カレンダー" })).toHaveAttribute(
    "href",
    `/workspaces/${workspace.id}/calendar`,
  );
});

test("dashboard has no non-task-event display section (Requirement 8.1)", async ({
  page,
  workspace,
}) => {
  await page.goto(`/workspaces/${workspace.id}`);

  // Only heading-level assertions matter here: "非タスクイベント" and
  // "直近のイベント" are the section's own vocabulary, not incidental
  // substrings that could appear elsewhere on the dashboard (the overdue
  // panel dashboard.spec.ts verifies uses distinct wording, e.g.
  // "期限超過・未完了の案件").
  await expect(page.getByRole("heading", { name: "直近のイベント" })).toHaveCount(0);
  await expect(page.getByText("直近のイベント")).toHaveCount(0);
  await expect(page.getByText("非タスクイベント")).toHaveCount(0);
});

test("backend no longer serves the removed events API (defense in depth)", async ({ request }) => {
  const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";
  const response = await request.get(`${apiBaseUrl}/api/events`);
  expect(response.status()).toBe(404);
});
