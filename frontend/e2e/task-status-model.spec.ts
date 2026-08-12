// E2E: task-status-model main UI flows (task 7.3, design.md "E2E Tests",
// Requirements 1.5, 1.8, 2.1, 4.5, 7.1, 8.1, 8.4, 8.10).
//
// Covers: terminal columns on the kanban board, throughput after moving to
// the completed column, status hidden on terminal cards/list rows, calendar
// overdue excluded for closed tasks, and disabled delete on terminal stages.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import {
  expect,
  registerWorkspaceMember,
  test,
  workspacePagePath,
  workspaceScopedHeaders,
} from "./fixtures";
import { dragCardTo } from "./drag";

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3400";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Throughput only counts fully-elapsed past periods (not the current week). */
function previousWeekMidUtcIso(): string {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (midnight.getUTCDay() + 6) % 7;
  midnight.setUTCDate(midnight.getUTCDate() - daysSinceMonday);
  // Wednesday of the previous UTC week — safely inside that period.
  midnight.setUTCDate(midnight.getUTCDate() - 4);
  midnight.setUTCHours(12, 0, 0, 0);
  return midnight.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Move an already-stamped completedAt into a past throughput window.
 * Refuses to write when completed_at is null (UI/API stamp must have happened).
 */
function backdateExistingCompletedAt(taskId: string, mysqlDatetimeUtc: string): void {
  const sql = [
    `SET @n = (SELECT COUNT(*) FROM tasks WHERE id = '${taskId}' AND completed_at IS NOT NULL);`,
    `UPDATE tasks SET completed_at = '${mysqlDatetimeUtc}' WHERE id = '${taskId}' AND completed_at IS NOT NULL;`,
    `SELECT @n AS stamped_before_update;`,
  ].join(" ");
  const output = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "mysql",
      "mysql",
      "-N",
      "-uapp_user",
      "-plocal_app_pw_test",
      "task_delivery_management",
      "-e",
      sql,
    ],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const stamped = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("mysql:"))
    .at(-1);
  if (stamped !== "1") {
    throw new Error(
      `backdateExistingCompletedAt: task ${taskId} had null completed_at (stamped_before_update=${stamped ?? "<empty>"})`,
    );
  }
}

type ApiStage = {
  id: string;
  name: string;
  kind: "normal" | "completed" | "cancelled";
  order: number;
};

type ApiTask = {
  id: string;
  title: string;
  developmentStageId: string | null;
  completedAt?: string | null;
};

type ApiTemplate = {
  id: string;
  title: string;
  isActive: boolean;
};

async function listStages(request: APIRequestContext, workspaceId: string): Promise<ApiStage[]> {
  const response = await request.get(`${API_BASE_URL}/api/development-stages`, {
    headers: { "x-workspace-id": workspaceId },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ApiStage[];
}

async function listTasks(request: APIRequestContext, workspaceId: string): Promise<ApiTask[]> {
  const response = await request.get(`${API_BASE_URL}/api/tasks`, {
    headers: { "x-workspace-id": workspaceId },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ApiTask[];
}

async function moveTaskToStage(
  request: APIRequestContext,
  workspaceId: string,
  taskId: string,
  developmentStageId: string,
  assigneeUserId?: string,
) {
  const response = await request.patch(`${API_BASE_URL}/api/tasks/${taskId}/development-stage`, {
    headers: await workspaceScopedHeaders(request, workspaceId),
    data: { developmentStageId, ...(assigneeUserId ? { assigneeUserId } : {}) },
  });
  expect(response.ok()).toBeTruthy();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysAgoLocal(days: number): { year: number; month: number; day: number; iso: string } {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return { year, month, day, iso: isoDate(year, month, day) };
}

async function setDateViaPicker(container: Locator, triggerName: string, iso: string) {
  const trigger = container.getByRole("button", { name: triggerName, exact: true });
  await trigger.click();
  const popover = container.getByRole("dialog", { name: `${triggerName}を選択` });
  await expect(popover).toBeVisible();

  const [yearPart, monthPart] = iso.split("-");
  const targetYear = Number(yearPart);
  const targetMonth = Number(monthPart);
  const monthLabelLocator = popover.locator("span.text-sm.font-medium.text-slate-900");
  for (let i = 0; i < 240; i++) {
    const label = await monthLabelLocator.textContent();
    const match = label?.match(/^(\d+)年(\d+)月$/);
    if (!match) throw new Error(`unexpected month label: ${label}`);
    const [, yearStr, monthStr] = match;
    const visibleYear = Number(yearStr);
    const visibleMonth = Number(monthStr);
    if (visibleYear === targetYear && visibleMonth === targetMonth) break;
    const diff = (targetYear - visibleYear) * 12 + (targetMonth - visibleMonth);
    await popover.getByRole("button", { name: diff > 0 ? "次の月" : "前の月", exact: true }).click();
  }

  await popover.getByRole("button", { name: iso, exact: true }).click();
  await popover.getByRole("button", { name: "決定", exact: true }).click();
  await expect(popover).toBeHidden();
}

async function registerCaseStartTemplate(
  page: Page,
  workspaceId: string,
  title: string,
) {
  await page.goto(workspacePagePath(workspaceId, "recurrence"));
  await page.getByRole("button", { name: "テンプレートを登録" }).click();
  const modal = page.locator(".recurrence-form-modal");
  await expect(modal).toBeVisible();
  await modal.getByLabel("テンプレート名").fill(title);
  await modal.getByLabel("優先度").selectOption({ label: "中" });
  await modal.getByLabel("起点").selectOption({ label: "案件開始日" });
  await modal.getByLabel("オフセット日数").fill("0");
  await modal.getByLabel("非営業日に該当した場合の扱い").selectOption({ label: "そのまま登録" });
  await modal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(modal).toBeHidden();
}

async function stopTemplatesByTitle(
  request: APIRequestContext,
  workspaceId: string,
  titles: string[],
) {
  const response = await request.get(`${API_BASE_URL}/api/recurring-templates`, {
    headers: { "x-workspace-id": workspaceId },
  });
  expect(response.ok()).toBeTruthy();
  const templates = (await response.json()) as ApiTemplate[];
  const wanted = new Set(titles);
  for (const template of templates) {
    if (!wanted.has(template.title) || !template.isActive) continue;
    const stop = await request.post(`${API_BASE_URL}/api/recurring-templates/${template.id}/stop`, {
      headers: await workspaceScopedHeaders(request, workspaceId),
    });
    expect([204, 200, 404]).toContain(stop.status());
  }
}

async function createCaseApplyingTemplates(
  page: Page,
  workspaceId: string,
  name: string,
  opts: { startDate: string; endDate: string },
) {
  await page.goto(workspacePagePath(workspaceId, "cases"));
  await page.getByRole("button", { name: "案件を登録" }).click();
  const formModal = page.locator(".case-form-modal");
  await expect(formModal).toBeVisible();
  await formModal.getByLabel("案件名").fill(name);
  await setDateViaPicker(formModal, "開始日", opts.startDate);
  await setDateViaPicker(formModal, "終了日", opts.endDate);
  await formModal.getByRole("button", { name: "登録", exact: true }).click();
  await expect(formModal).toBeHidden();
}

function monthHeading(page: Page): Locator {
  return page.locator("span.min-w-20.text-center.text-sm.font-medium.tabular-nums");
}

async function goToMonth(page: Page, year: number, month: number) {
  const target = `${year}年${month}月`;
  for (let i = 0; i < 36; i++) {
    const label = await monthHeading(page).textContent();
    if (label === target) return;
    const match = label?.match(/^(\d+)年(\d+)月$/);
    if (!match) throw new Error(`unexpected calendar month label: ${label}`);
    const visibleYear = Number(match[1]);
    const visibleMonth = Number(match[2]);
    const diff = (year - visibleYear) * 12 + (month - visibleMonth);
    const prev = label ?? "";
    await page.getByRole("button", { name: diff > 0 ? "次月" : "前月" }).click();
    await expect(monthHeading(page)).not.toHaveText(prev);
  }
  throw new Error(`failed to reach ${target}`);
}

function stageColumn(page: Page, stageName: string): Locator {
  return page.locator(".column[data-stage-id]", { hasText: stageName });
}

test("kanban shows completed and cancelled columns like other stage columns (Requirements 8.1)", async ({
  page,
  workspace,
}) => {
  const stages = await listStages(page.request, workspace.id);
  const completed = stages.find((s) => s.kind === "completed");
  const cancelled = stages.find((s) => s.kind === "cancelled");
  expect(completed).toBeTruthy();
  expect(cancelled).toBeTruthy();

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  const completedCol = stageColumn(page, completed!.name);
  const cancelledCol = stageColumn(page, cancelled!.name);
  await expect(completedCol).toBeVisible();
  await expect(cancelledCol).toBeVisible();
  await expect(completedCol.locator("h2")).toHaveText(completed!.name);
  await expect(cancelledCol.locator("h2")).toHaveText(cancelled!.name);
  await expect(completedCol.locator(".card-list")).toBeVisible();
  await expect(cancelledCol.locator(".card-list")).toBeVisible();

  // Fresh workspace still has only terminals; create a normal stage and
  // confirm the board treats all three columns the same structurally.
  const normalName = `e2e-tsm-normal-${Date.now()}`;
  await page.goto(workspacePagePath(workspace.id, "kanban/stages"));
  await page.getByPlaceholder("段階名(例: 仕様未確定)").fill(normalName);
  await page.getByRole("button", { name: "登録" }).click();
  await expect(page.locator(".stage-list", { hasText: normalName })).toBeVisible();

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  const normalCol = stageColumn(page, normalName);
  await expect(normalCol).toBeVisible();
  await expect(normalCol.locator(".card-list")).toBeVisible();
  await expect(stageColumn(page, completed!.name).locator(".card-list")).toBeVisible();
  await expect(stageColumn(page, cancelled!.name).locator(".card-list")).toBeVisible();
});

test("moving a card to the completed column updates throughput (Requirements 2.1, 7.1)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const userName = `e2e-tsm-user-${suffix}`;
  const taskTitle = `e2e-tsm-throughput-${suffix}`;
  const member = await registerWorkspaceMember(page, request, workspace.id, userName);

  await page.goto(workspacePagePath(workspace.id, "tasks"));
  await page.getByPlaceholder("タスク名").fill(taskTitle);
  await page.getByRole("button", { name: "タスク登録" }).click();
  await expect(page.locator("li", { hasText: taskTitle }).first()).toBeVisible();

  const stages = await listStages(page.request, workspace.id);
  const completed = stages.find((s) => s.kind === "completed");
  expect(completed).toBeTruthy();

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  await page.getByRole("button", { name: /展開/ }).click();
  const card = page.locator(".card[data-task-id]", { hasText: taskTitle });
  const completedList = stageColumn(page, completed!.name).locator(".card-list");
  await dragCardTo(page, card, completedList);

  await expect(page.locator(".assignee-picker")).toBeVisible();
  await page.locator(".assignee-picker select").selectOption({ label: userName });
  await page.getByRole("button", { name: "確定" }).click();
  // Optimistic UI places the card before PATCH returns — wait for the write
  // to finish (picker gone + success toast) before reading completedAt.
  await expect(page.locator(".assignee-picker")).toBeHidden();
  await expect(page.getByRole("status")).toContainText("に移動しました");
  const movedCard = completedList.locator(".card[data-task-id]", { hasText: taskTitle });
  await expect(movedCard).toBeVisible();
  const taskId = await movedCard.getAttribute("data-task-id");
  expect(taskId).toBeTruthy();

  // Poll until the server stamp is visible (PATCH may still lag the toast).
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${API_BASE_URL}/api/tasks/${taskId}`, {
          headers: { "x-workspace-id": workspace.id },
        });
        if (!response.ok()) return null;
        const body = (await response.json()) as ApiTask;
        return body.completedAt ?? null;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();

  // Digestion counts past periods only; shift the UI-stamped completion into
  // the previous UTC week so the dashboard can reflect it.
  backdateExistingCompletedAt(taskId!, previousWeekMidUtcIso());

  await page.goto(workspacePagePath(workspace.id, "throughput"));
  await expect(page.getByRole("heading", { name: "消化数ダッシュボード" })).toBeVisible();
  await page.getByRole("button", { name: "表示", exact: true }).click();
  const countCells = page.locator("tbody tr td:nth-child(3)");
  await expect.poll(async () => {
    const texts = await countCells.allTextContents();
    return texts.map((t) => Number(t.trim())).reduce((a, b) => a + b, 0);
  }).toBeGreaterThanOrEqual(1);

  expect(member.id).toBeTruthy();
});

test("terminal column cards and task-list rows hide status (Requirements 4.5, 8.10)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const userName = `e2e-tsm-status-${suffix}`;
  const completedTitle = `e2e-tsm-done-${suffix}`;
  const cancelledTitle = `e2e-tsm-cancel-${suffix}`;
  const member = await registerWorkspaceMember(page, request, workspace.id, userName);

  for (const title of [completedTitle, cancelledTitle]) {
    await page.goto(workspacePagePath(workspace.id, "tasks"));
    await page.getByPlaceholder("タスク名").fill(title);
    await page.getByRole("button", { name: "タスク登録" }).click();
    await expect(page.locator("li", { hasText: title }).first()).toBeVisible();
  }

  const stages = await listStages(page.request, workspace.id);
  const completed = stages.find((s) => s.kind === "completed");
  const cancelled = stages.find((s) => s.kind === "cancelled");
  expect(completed).toBeTruthy();
  expect(cancelled).toBeTruthy();

  const tasks = await listTasks(page.request, workspace.id);
  const completedTask = tasks.find((t) => t.title === completedTitle);
  const cancelledTask = tasks.find((t) => t.title === cancelledTitle);
  expect(completedTask).toBeTruthy();
  expect(cancelledTask).toBeTruthy();

  await moveTaskToStage(page.request, workspace.id, completedTask!.id, completed!.id, member.id);
  await moveTaskToStage(page.request, workspace.id, cancelledTask!.id, cancelled!.id, member.id);

  await page.goto(workspacePagePath(workspace.id, "kanban"));
  const completedCard = stageColumn(page, completed!.name).locator(".card[data-task-id]", {
    hasText: completedTitle,
  });
  const cancelledCard = stageColumn(page, cancelled!.name).locator(".card[data-task-id]", {
    hasText: cancelledTitle,
  });
  await expect(completedCard).toBeVisible();
  await expect(cancelledCard).toBeVisible();
  for (const label of ["未着手", "作業中", "引継待ち", "保留"]) {
    await expect(completedCard.getByText(label, { exact: true })).toHaveCount(0);
    await expect(cancelledCard.getByText(label, { exact: true })).toHaveCount(0);
  }

  await page.goto(workspacePagePath(workspace.id, "tasks"));
  for (const title of [completedTitle, cancelledTitle]) {
    const row = page.locator("li[data-task-id]", { hasText: title }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("task-node-badges").getByText("未着手", { exact: true })).toHaveCount(0);
    await expect(row.getByTestId("task-node-badges").getByText("作業中", { exact: true })).toHaveCount(0);
    await expect(row.getByTestId("task-node-actions").locator("select")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "分割", exact: true })).toHaveCount(0);
  }
});

test("past-due completed and cancelled tasks are not overdue on the calendar (Requirement 8.4)", async ({
  page,
  request,
  workspace,
}) => {
  const suffix = Date.now();
  const userName = `e2e-tsm-cal-user-${suffix}`;
  const completedTpl = `e2e-tsm-cal-done-tpl-${suffix}`;
  const cancelledTpl = `e2e-tsm-cal-cancel-tpl-${suffix}`;
  const completedCase = `e2e-tsm-cal-done-case-${suffix}`;
  const cancelledCase = `e2e-tsm-cal-cancel-case-${suffix}`;
  const member = await registerWorkspaceMember(page, request, workspace.id, userName);
  const past = daysAgoLocal(3);

  // One active template at a time so each case materializes a single task
  // (shared-dev-DB active templates otherwise inject duplicates of both titles).
  await registerCaseStartTemplate(page, workspace.id, completedTpl);
  await createCaseApplyingTemplates(page, workspace.id, completedCase, {
    startDate: past.iso,
    endDate: past.iso,
  });
  await stopTemplatesByTitle(page.request, workspace.id, [completedTpl]);

  await registerCaseStartTemplate(page, workspace.id, cancelledTpl);
  await createCaseApplyingTemplates(page, workspace.id, cancelledCase, {
    startDate: past.iso,
    endDate: past.iso,
  });
  await stopTemplatesByTitle(page.request, workspace.id, [cancelledTpl]);

  const stages = await listStages(page.request, workspace.id);
  const completed = stages.find((s) => s.kind === "completed");
  const cancelled = stages.find((s) => s.kind === "cancelled");
  expect(completed).toBeTruthy();
  expect(cancelled).toBeTruthy();

  const tasks = await listTasks(page.request, workspace.id);
  const completedTask = tasks.find((t) => t.title === completedTpl);
  const cancelledTask = tasks.find((t) => t.title === cancelledTpl);
  expect(completedTask).toBeTruthy();
  expect(cancelledTask).toBeTruthy();

  await moveTaskToStage(page.request, workspace.id, completedTask!.id, completed!.id, member.id);
  await moveTaskToStage(page.request, workspace.id, cancelledTask!.id, cancelled!.id, member.id);

  await page.goto(workspacePagePath(workspace.id, "calendar"));
  await goToMonth(page, past.year, past.month);

  for (const title of [completedTpl, cancelledTpl]) {
    const marker = page.getByRole("button", { name: `${title} の詳細を開く` });
    await expect(marker).toHaveCount(1);
    await expect(marker).toBeVisible();
    await expect(marker).not.toHaveClass(/border-red-300/);
    await expect(marker).not.toHaveClass(/bg-red-50/);
    await expect(marker.locator("span.min-w-0")).not.toHaveClass(/text-red-700/);
  }
});

test("development stage master disables delete for terminal stages (Requirements 1.5, 1.8)", async ({
  page,
  workspace,
}) => {
  await page.goto(workspacePagePath(workspace.id, "kanban/stages"));
  await expect(page.getByRole("heading", { name: "開発段階マスタ" })).toBeVisible();

  const stages = await listStages(page.request, workspace.id);
  const terminals = stages.filter((s) => s.kind === "completed" || s.kind === "cancelled");
  expect(terminals.length).toBe(2);

  for (const stage of terminals) {
    const row = page.locator(".stage-list li[data-stage-id]", { hasText: stage.name }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("stage-kind-badge")).toBeVisible();
    const deleteBtn = row.getByTestId("stage-delete");
    await expect(deleteBtn).toBeDisabled();
    await expect(row.getByTestId("stage-delete-reason")).toHaveText("この段階は削除できません");
  }
});
