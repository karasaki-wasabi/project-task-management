import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CaseTemplateApplyOperation,
  CreateCaseInput,
  CreateTaskInput,
  RegisterTemplateInput,
  RecurringTaskTemplate,
  UpdateCaseInput,
} from "./useApiClient";
import { joinApiUrl, useApiClient } from "./useApiClient";

const fetchMock = vi.fn();
const clientSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "useApiClient.ts"),
  "utf8",
);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(undefined);
  vi.stubGlobal("$fetch", fetchMock);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiBaseUrl: "http://backend:3000" },
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
      defaultMemo: "memo",
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
