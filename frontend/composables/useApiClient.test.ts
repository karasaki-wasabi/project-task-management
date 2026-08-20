// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import type {
  CaseOutlook,
  CaseTemplateApplyOperation,
  TaskComment,
  CreateCaseInput,
  CreateTaskInput,
  RegisterTemplateInput,
  RecurringTaskTemplate,
  Task,
  TaskTimelinePage,
  ThroughputPeriod,
  ThroughputSummary,
  UpdateCaseInput,
  UpdateTaskInput,
} from "./useApiClient";
import { joinApiUrl, useApiClient } from "./useApiClient";

const fetchMock = vi.hoisted(() => vi.fn());
const currentId = ref<string | null>(null);
const workspaces = ref<{ id: string }[]>([]);
const refresh = vi.fn();
const relocateAfterWorkspaceLost = vi.fn();
const clientSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "useApiClient.ts"),
  "utf8",
);

mockNuxtImport("useRuntimeConfig", () => () => ({
  public: { apiBaseUrl: "http://backend:3000" },
}));
mockNuxtImport("useCurrentWorkspace", () => () => ({
  currentId,
  workspaces,
  refresh,
  relocateAfterWorkspaceLost,
}));
mockNuxtImport("$fetch", () => fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(undefined);
  currentId.value = null;
  workspaces.value = [];
  refresh.mockReset();
  relocateAfterWorkspaceLost.mockReset();
  refresh.mockResolvedValue(undefined);
});

describe("joinApiUrl (task 1.6)", () => {
  it("末尾にスラッシュのないベースURLと、先頭にスラッシュのないパスを正規化", () => {
    expect(joinApiUrl("http://backend:3000", "api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("ベースURLの末尾にスラッシュを正規化", () => {
    expect(joinApiUrl("http://backend:3000/", "api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("パスの先頭にスラッシュを正規化", () => {
    expect(joinApiUrl("http://backend:3000", "/api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("ベースURLの末尾にスラッシュと、パスの先頭にスラッシュを正規化", () => {
    expect(joinApiUrl("http://backend:3000/", "/api/tasks")).toBe("http://backend:3000/api/tasks");
  });
});

describe("useApiClient の認証および CSRF (task 6.1)", () => {
  it("CSRFを初期化し、認証メソッドを公開し、古いユーザーの変更を排除", async () => {
    fetchMock.mockResolvedValueOnce({ token: "initial-csrf-token" });

    const api = useApiClient();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith("http://backend:3000/api/auth/csrf", {
      credentials: "include",
    });
    expect(typeof api.register).toBe("function");
    expect(typeof api.login).toBe("function");
    expect(typeof api.logout).toBe("function");
    expect(typeof api.me).toBe("function");
    expect(typeof api.csrf).toBe("function");
    expect(api).not.toHaveProperty("createUser");
    expect(api).not.toHaveProperty("deleteUser");
  });

  it("初期化されたCSRFトークンと認証情報を変更要求に添付", async () => {
    fetchMock.mockResolvedValueOnce({ token: "csrf-token" });
    fetchMock.mockResolvedValueOnce({ id: "task-1" });
    const api = useApiClient();
    const input: CreateTaskInput = { title: "CSRF protected task", priority: "medium" };

    await api.createTask(input);

    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/tasks", {
      method: "POST",
      body: input,
      credentials: "include",
      headers: { "csrf-token": "csrf-token" },
    });
  });

  it("登録とログインが成功した後にCSRFを更新", async () => {
    const user = {
      id: "user-1",
      email: "member@example.com",
      name: "利用者",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    fetchMock
      .mockResolvedValueOnce({ token: "initial-token" })
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ token: "after-register-token" })
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ token: "after-login-token" });
    const api = useApiClient();

    await api.register({ email: user.email, name: user.name, password: "password123" });
    await api.login({ email: user.email, password: "password123" });

    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://backend:3000/api/auth/csrf", {
      credentials: "include",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, "http://backend:3000/api/auth/csrf", {
      credentials: "include",
    });
  });
});

describe("useApiClient のタスクフィールド名変更 (task-field-rename 5.1)", () => {
  it("クライアントの型で detail / scheduledEndDate / defaultDetail を使用し、古い名前を削除", () => {
    expect(clientSource).toMatch(/\bdetail\??:/);
    expect(clientSource).toMatch(/\bscheduledEndDate\??:/);
    expect(clientSource).toMatch(/\bdefaultDetail\??:/);
    expect(clientSource).not.toMatch(/\bmemo\??:/);
    expect(clientSource).not.toMatch(/\bscheduledDate\??:/);
    expect(clientSource).not.toMatch(/\bdefaultMemo\??:/);
  });
});

describe("useApiClient のタスク詳細 (task-detail 8)", () => {
  it("タスクの作成/更新フィールドと削除されたタスクの応答を型付け", () => {
    const createInput: CreateTaskInput = {
      title: "終了予定日付きタスク",
      priority: "high",
      scheduledEndDate: "2026-08-31",
    };
    const updateInput: UpdateTaskInput = {
      parentTaskId: null,
      scheduledEndDate: null,
    };
    const deletedTask: Task = {
      id: "task-1",
      title: createInput.title,
      status: "not_started",
      priority: createInput.priority,
      isRequiredForCase: false,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      deletedAt: "2026-08-13T00:00:00.000Z",
    };

    expect(createInput.scheduledEndDate).toBe("2026-08-31");
    expect(updateInput).toEqual({ parentTaskId: null, scheduledEndDate: null });
    expect(deletedTask.deletedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("親候補フィルターを listTasks に渡す", async () => {
    const api = useApiClient();

    await api.listTasks({
      titleContains: "親候補",
      excludeSubtreeOf: "task-1",
      excludeClosed: true,
    });

    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/tasks", {
      query: {
        titleContains: "親候補",
        excludeSubtreeOf: "task-1",
        excludeClosed: "true",
        unassignedCase: undefined,
      },
      credentials: "include",
    });
  });

  it("フィルター、カーソル、および制限を指定して型付けされたタスクタイムラインを取得", async () => {
    const page: TaskTimelinePage = { items: [], nextCursor: null };
    fetchMock.mockResolvedValueOnce({ token: "csrf" }).mockResolvedValueOnce(page);
    const api = useApiClient();

    const result = await api.getTaskTimeline("task-1", {
      filter: "comments",
      cursor: "next-page",
      limit: 10,
    });

    expect(result).toBe(page);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/tasks/task-1/timeline",
      {
        query: { filter: "comments", cursor: "next-page", limit: 10 },
        credentials: "include",
      },
    );
  });

  it("コメントを作成、更新、および削除", async () => {
    const comment: TaskComment = {
      id: "comment-1",
      taskId: "task-1",
      authorUserId: "user-1",
      body: "本文",
      editedAt: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      deletedAt: null,
    };
    fetchMock
      .mockResolvedValueOnce({ token: "csrf" })
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce({ ...comment, body: "編集後" })
      .mockResolvedValueOnce(undefined);
    const api = useApiClient();

    await api.createComment("task-1", "本文");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/tasks/task-1/comments",
      { method: "POST", body: { body: "本文" }, credentials: "include", headers: { "csrf-token": "csrf" } },
    );

    await api.updateComment("task-1", "comment-1", "編集後");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/tasks/task-1/comments/comment-1",
      { method: "PATCH", body: { body: "編集後" }, credentials: "include", headers: { "csrf-token": "csrf" } },
    );

    await api.deleteComment("task-1", "comment-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/tasks/task-1/comments/comment-1",
      { method: "DELETE", credentials: "include", headers: { "csrf-token": "csrf" } },
    );
  });
});

describe("useApiClient の再発行および案件テンプレート操作 (task 5.1)", () => {
  it("クライアントのソースで fixed_interval / generate-due を削除し、caseAnchor + templateOperations を型付け", () => {
    expect(clientSource).not.toMatch(/fixed_interval/);
    expect(clientSource).not.toMatch(/generateDueInstances|generate-due/);
    expect(clientSource).not.toMatch(/\bRecurrenceKind\b|\bIntervalUnit\b/);
    expect(clientSource).toMatch(/caseAnchor/);
    expect(clientSource).toMatch(/CaseRelativeAnchor/);
    expect(clientSource).toMatch(/CaseTemplateApplyOperation/);
    expect(clientSource).toMatch(/templateOperations/);
    expect(clientSource).toMatch(/resumeRecurringTemplate/);

    const registerInput: RegisterTemplateInput = {
      title: "月末確認",
      priority: "medium",
      caseAnchor: "period_month_end",
      caseOffsetDays: 0,
      nonBusinessDayPolicy: "next_business_day",
    };
    const template: RecurringTaskTemplate = {
      id: "t1",
      title: "月末確認",
      priority: "medium",
      caseAnchor: "period_month_end",
      caseOffsetDays: 0,
      nonBusinessDayPolicy: "next_business_day",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const createInput: CreateCaseInput = {
      name: "案件A",
      templateOperations: ["start_generate"],
    };
    const updateInput: UpdateCaseInput = { templateOperations: [] };
    expect(registerInput.caseAnchor).toBe("period_month_end");
    expect(template.caseOffsetDays).toBe(0);
    expect(createInput.templateOperations).toEqual(["start_generate"]);
    expect(updateInput.templateOperations).toEqual([]);
  });

  it("registerRecurringTemplate は case-relative RegisterTemplateInput を POST", async () => {
    const api = useApiClient();
    const input: RegisterTemplateInput = {
      title: "月末確認",
      priority: "medium",
      caseAnchor: "period_month_end",
      caseOffsetDays: 0,
      nonBusinessDayPolicy: "next_business_day",
      defaultDetail: "detail",
    };
    await api.registerRecurringTemplate(input);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/recurring-templates",
      { method: "POST", body: input, credentials: "include" },
    );
  });

  it("resumeRecurringTemplate は .../resume を POST し、generateDueInstances を公開しない", async () => {
    const api = useApiClient();
    expect(api).not.toHaveProperty("generateDueInstances");
    expect(typeof api.resumeRecurringTemplate).toBe("function");

    await api.resumeRecurringTemplate("tmpl-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/recurring-templates/tmpl-1/resume",
      { method: "POST", credentials: "include" },
    );
  });

  it("createCase / updateCase はオプションの templateOperations を受け入れる", async () => {
    const api = useApiClient();
    const ops: CaseTemplateApplyOperation[] = ["start_generate", "end_generate"];

    await api.createCase({
      name: "案件A",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      templateOperations: ops,
    });
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/cases", {
      method: "POST",
      body: {
        name: "案件A",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        templateOperations: ops,
      },
      credentials: "include",
    });

    fetchMock.mockClear();
    await api.updateCase("case-1", {
      endDate: "2026-05-31",
      templateOperations: [],
    });
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/cases/case-1", {
      method: "PATCH",
      body: {
        endDate: "2026-05-31",
        templateOperations: [],
      },
      credentials: "include",
    });
  });
});

describe("useApiClient のワークスペース (task 5.1)", () => {
  it("Workspace 型とワークスペース API メソッドを公開", () => {
    expect(clientSource).toMatch(/export const WORKSPACE_COLORS/);
    expect(clientSource).toMatch(/export type WorkspaceColor/);
    expect(clientSource).toMatch(/export interface Workspace\b/);
    expect(clientSource).toMatch(/export interface WorkspaceUserSummary/);
    expect(clientSource).toMatch(/listWorkspaces/);
    expect(clientSource).toMatch(/createWorkspace/);
    expect(clientSource).toMatch(/updateWorkspace/);
    expect(clientSource).toMatch(/deleteWorkspace/);
    expect(clientSource).toMatch(/listWorkspaceMembers/);
    expect(clientSource).toMatch(/searchAddableWorkspaceUsers/);
    expect(clientSource).toMatch(/addWorkspaceMember/);
  });

  it("listWorkspaces は /api/workspaces を GET", async () => {
    const api = useApiClient();
    await api.listWorkspaces();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces", {
      credentials: "include",
    });
  });

  it("createWorkspace は { name } を /api/workspaces に POST", async () => {
    const api = useApiClient();
    await api.createWorkspace({ name: "Team" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces", {
      method: "POST",
      body: { name: "Team" },
      credentials: "include",
    });
  });

  it("updateWorkspace は name/color を PATCH し、deleteWorkspace は DELETE", async () => {
    const api = useApiClient();
    await api.updateWorkspace("ws-1", { name: "Renamed" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces/ws-1", {
      method: "PATCH",
      body: { name: "Renamed" },
      credentials: "include",
    });

    fetchMock.mockClear();
    await api.deleteWorkspace("ws-1");
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces/ws-1", {
      method: "DELETE",
      credentials: "include",
    });
  });

  it("メンバーエンドポイントは members と searchable-users を呼び出す", async () => {
    const api = useApiClient();

    await api.listWorkspaceMembers("ws-1");
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces/ws-1/members", {
      credentials: "include",
    });

    fetchMock.mockClear();
    await api.searchAddableWorkspaceUsers("ws-1", "alice");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/workspaces/ws-1/searchable-users",
      { query: { q: "alice" }, credentials: "include" },
    );

    fetchMock.mockClear();
    await api.addWorkspaceMember("ws-1", "user-2");
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces/ws-1/members", {
      method: "POST",
      body: { userId: "user-2" },
      credentials: "include",
    });
  });

  it("listUsers はオプションの q クエリを受け入れる", async () => {
    const api = useApiClient();
    await api.listUsers();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/users", {
      credentials: "include",
    });

    fetchMock.mockClear();
    await api.listUsers("bob");
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/users", {
      query: { q: "bob" },
      credentials: "include",
    });
  });
});

describe("useApiClient のワークスペーススコープヘッダ (task 7.1)", () => {
  it("currentId が設定されている場合、x-workspace-id をスコープ付きパスに添付", async () => {
    currentId.value = "ws-1";
    const api = useApiClient();

    await api.listCases();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/cases", {
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.listTasks();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/tasks", {
      query: { unassignedCase: undefined },
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.listRecurringTemplates();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/recurring-templates", {
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.listHolidays();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/holidays", {
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.listDevelopmentStages();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/development-stages", {
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.getThroughput("week", 4);
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/throughput", {
      query: { periodType: "week", rangeCount: 4 },
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });
  });

  it("currentId が null の場合、x-workspace-id を省略", async () => {
    currentId.value = null;
    const api = useApiClient();

    await api.listCases();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/cases", {
      credentials: "include",
    });
  });

  it("x-workspace-id を /api/throughput に添付し、/api/workspaces には省略 (velocity-dashboard 4.1)", async () => {
    currentId.value = "ws-1";
    const api = useApiClient();

    await api.getThroughput("week", 4);
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/throughput", {
      query: { periodType: "week", rangeCount: 4 },
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.getThroughput("month", 3, "case-1");
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/throughput", {
      query: { periodType: "month", rangeCount: 3, caseId: "case-1" },
      credentials: "include",
      headers: { "x-workspace-id": "ws-1" },
    });

    fetchMock.mockClear();
    await api.listWorkspaces();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces", {
      credentials: "include",
    });
  });

  it("storyPoints と throughput point/outlook 型を公開 (velocity-dashboard 4.1)", () => {
    expect(clientSource).toMatch(/storyPoints\??:/);
    expect(clientSource).toMatch(/completedPoints:/);
    expect(clientSource).toMatch(/forecastNextPeriodPoints:/);
    expect(clientSource).toMatch(/export interface CaseOutlook/);
    expect(clientSource).toMatch(/caseOutlook\??:/);
    expect(clientSource).toMatch(/\/api\/throughput/);

    const task: Task = {
      id: "t1",
      title: "Leaf",
      status: "not_started",
      priority: "medium",
      isRequiredForCase: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      storyPoints: 5,
    };
    const createInput: CreateTaskInput = {
      title: "New",
      priority: "low",
      storyPoints: 3,
    };
    const updateInput: UpdateTaskInput = { storyPoints: null };
    const period: ThroughputPeriod = {
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
      completedCount: 2,
      completedPoints: 8,
    };
    const outlook: CaseOutlook = {
      openTaskCount: 4,
      openPoints: 12,
      requiredPeriods: 2,
      remainingPeriods: 3,
      marginPoints: 5,
    };
    const summary: ThroughputSummary = {
      periods: [period],
      forecastNextPeriodCount: 1,
      forecastNextPeriodPoints: 4,
      caseOutlook: outlook,
    };

    expect(task.storyPoints).toBe(5);
    expect(createInput.storyPoints).toBe(3);
    expect(updateInput.storyPoints).toBeNull();
    expect(summary.forecastNextPeriodPoints).toBe(4);
    expect(summary.caseOutlook?.openPoints).toBe(12);
  });

  it("変更要求のスコープ付きリクエストに x-workspace-id と csrf-token をマージ", async () => {
    currentId.value = "ws-1";
    fetchMock.mockResolvedValueOnce({ token: "csrf-token" });
    fetchMock.mockResolvedValueOnce({ id: "task-1" });
    const api = useApiClient();
    const input: CreateTaskInput = { title: "Scoped task", priority: "medium" };

    await api.createTask(input);

    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/tasks", {
      method: "POST",
      body: input,
      credentials: "include",
      headers: { "csrf-token": "csrf-token", "x-workspace-id": "ws-1" },
    });
  });

  it("スコープ付き 403 で所属から消えていれば refresh 後に退避する（workspace-url-routing 5.2）", async () => {
    currentId.value = "ws-lost";
    workspaces.value = [{ id: "ws-lost" }];
    refresh.mockImplementation(async () => {
      workspaces.value = [{ id: "ws-other" }];
    });
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/csrf")) {
        return Promise.resolve({ token: "csrf" });
      }
      return Promise.reject({ statusCode: 403, message: "Forbidden" });
    });

    const api = useApiClient();
    await Promise.resolve();
    await expect(api.listCases()).rejects.toMatchObject({ statusCode: 403 });

    expect(refresh).toHaveBeenCalled();
    expect(relocateAfterWorkspaceLost).toHaveBeenCalledWith("ws-lost");
  });

  it("スコープ付き 403 でも所属に残っていれば退避しない", async () => {
    currentId.value = "ws-1";
    workspaces.value = [{ id: "ws-1" }];
    refresh.mockImplementation(async () => {
      workspaces.value = [{ id: "ws-1" }];
    });
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/csrf")) {
        return Promise.resolve({ token: "csrf" });
      }
      return Promise.reject({ statusCode: 403, message: "Forbidden" });
    });

    const api = useApiClient();
    await Promise.resolve();
    await expect(api.listCases()).rejects.toMatchObject({ statusCode: 403 });

    expect(refresh).toHaveBeenCalled();
    expect(relocateAfterWorkspaceLost).not.toHaveBeenCalled();
  });
});
