import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type {
  CaseTemplateApplyOperation,
  Comment,
  CreateCaseInput,
  CreateTaskInput,
  RegisterTemplateInput,
  RecurringTaskTemplate,
  Task,
  TaskTimelinePage,
  UpdateCaseInput,
  UpdateTaskInput,
} from "./useApiClient";
import { joinApiUrl, useApiClient } from "./useApiClient";

const fetchMock = vi.fn();
const currentId = ref<string | null>(null);
const workspaces = ref<{ id: string }[]>([]);
const refresh = vi.fn();
const relocateAfterWorkspaceLost = vi.fn();
const clientSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "useApiClient.ts"),
  "utf8",
);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(undefined);
  currentId.value = null;
  workspaces.value = [];
  refresh.mockReset();
  relocateAfterWorkspaceLost.mockReset();
  refresh.mockResolvedValue(undefined);
  vi.stubGlobal("$fetch", fetchMock);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiBaseUrl: "http://backend:3000" },
  }));
  vi.stubGlobal("useCurrentWorkspace", () => ({
    currentId,
    workspaces,
    refresh,
    relocateAfterWorkspaceLost,
  }));
});

describe("joinApiUrl (task 1.6)", () => {
  it("joins a base URL without a trailing slash and a path without a leading slash", () => {
    expect(joinApiUrl("http://backend:3000", "api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("normalizes a trailing slash on the base URL", () => {
    expect(joinApiUrl("http://backend:3000/", "api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("normalizes a leading slash on the path", () => {
    expect(joinApiUrl("http://backend:3000", "/api/tasks")).toBe("http://backend:3000/api/tasks");
  });

  it("normalizes both a trailing slash and a leading slash at once", () => {
    expect(joinApiUrl("http://backend:3000/", "/api/tasks")).toBe("http://backend:3000/api/tasks");
  });
});

describe("useApiClient auth and CSRF contract (task 6.1)", () => {
  it("initializes CSRF with credentials and exposes typed auth methods without legacy user mutations", async () => {
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

  it("attaches the initialized CSRF token and credentials to mutating requests", async () => {
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

  it("refreshes CSRF after successful registration and login", async () => {
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

describe("useApiClient task-field-rename contract (task-field-rename 5.1)", () => {
  it("client types use detail / scheduledEndDate / defaultDetail and drop old names", () => {
    expect(clientSource).toMatch(/\bdetail\??:/);
    expect(clientSource).toMatch(/\bscheduledEndDate\??:/);
    expect(clientSource).toMatch(/\bdefaultDetail\??:/);
    expect(clientSource).not.toMatch(/\bmemo\??:/);
    expect(clientSource).not.toMatch(/\bscheduledDate\??:/);
    expect(clientSource).not.toMatch(/\bdefaultMemo\??:/);
  });
});

describe("useApiClient task detail contract (task-detail 8)", () => {
  it("types task create/update fields and deleted task responses", () => {
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

  it("passes parent candidate filters to listTasks", async () => {
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

  it("gets a typed task timeline with filter, cursor, and limit", async () => {
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

  it("creates, updates, and deletes comments", async () => {
    const comment: Comment = {
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

describe("useApiClient recurrence + case templateOperations contract (task 5.1)", () => {
  it("client source drops fixed_interval / generate-due and types caseAnchor + templateOperations", () => {
    expect(clientSource).not.toMatch(/fixed_interval/);
    expect(clientSource).not.toMatch(/generateDueInstances|generate-due/);
    expect(clientSource).not.toMatch(/\bRecurrenceKind\b|\bIntervalUnit\b/);
    expect(clientSource).toMatch(/caseAnchor/);
    expect(clientSource).toMatch(/CaseRelativeAnchor/);
    expect(clientSource).toMatch(/CaseTemplateApplyOperation/);
    expect(clientSource).toMatch(/templateOperations/);
    expect(clientSource).toMatch(/resumeRecurringTemplate/);

    // Compile-time contract samples (vue-tsc / IDE); runtime value unused.
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

  it("registerRecurringTemplate posts case-relative RegisterTemplateInput", async () => {
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

  it("resumeRecurringTemplate POSTs .../resume and exposes no generateDueInstances", async () => {
    const api = useApiClient();
    expect(api).not.toHaveProperty("generateDueInstances");
    expect(typeof api.resumeRecurringTemplate).toBe("function");

    await api.resumeRecurringTemplate("tmpl-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://backend:3000/api/recurring-templates/tmpl-1/resume",
      { method: "POST", credentials: "include" },
    );
  });

  it("createCase / updateCase accept optional templateOperations", async () => {
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

describe("useApiClient workspace contract (task 5.1)", () => {
  it("exposes Workspace types and workspace API methods", () => {
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

  it("listWorkspaces GETs /api/workspaces", async () => {
    const api = useApiClient();
    await api.listWorkspaces();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces", {
      credentials: "include",
    });
  });

  it("createWorkspace POSTs { name } to /api/workspaces", async () => {
    const api = useApiClient();
    await api.createWorkspace({ name: "Team" });
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces", {
      method: "POST",
      body: { name: "Team" },
      credentials: "include",
    });
  });

  it("updateWorkspace PATCHes name/color and deleteWorkspace DELETEs", async () => {
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

  it("member endpoints call members and searchable-users contracts", async () => {
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

  it("listUsers accepts optional q query for search", async () => {
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

describe("useApiClient workspace scope header (task 7.1)", () => {
  it("attaches x-workspace-id to scoped paths when currentId is set", async () => {
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
  });

  it("omits x-workspace-id when currentId is null", async () => {
    currentId.value = null;
    const api = useApiClient();

    await api.listCases();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/cases", {
      credentials: "include",
    });
  });

  it("does not attach x-workspace-id to /api/throughput or /api/workspaces", async () => {
    currentId.value = "ws-1";
    const api = useApiClient();

    await api.getThroughput("week", 4);
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/throughput", {
      query: { periodType: "week", rangeCount: 4 },
      credentials: "include",
    });

    fetchMock.mockClear();
    await api.listWorkspaces();
    expect(fetchMock).toHaveBeenLastCalledWith("http://backend:3000/api/workspaces", {
      credentials: "include",
    });
  });

  it("merges x-workspace-id with csrf-token on mutating scoped requests", async () => {
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

  it("scoped 403 で所属から消えていれば refresh 後に退避する（workspace-url-routing 5.2）", async () => {
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

  it("scoped 403 でも所属に残っていれば退避しない", async () => {
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
