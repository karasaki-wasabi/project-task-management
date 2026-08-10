// Backend API client (task 1.6 scaffold + task 11.x typed domain methods,
// design.md "composables/useApiClient.ts — バックエンドAPIクライアント").
// Per design.md File Structure Plan: "各featureディレクトリはAPIクライアン
// トの型をそのまま利用し、独自の状態管理ライブラリは追加しない" — this one
// composable is the sole HTTP boundary; pages call these typed methods
// directly and hold their own local `ref`/`reactive` state.
export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export type TaskStatus = "not_started" | "in_progress" | "done" | "on_hold";
export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  memo?: string | null;
  caseId?: string | null;
  isRequiredForCase: boolean;
  parentTaskId?: string | null;
  assigneeUserId?: string | null;
  sourceTemplateId?: string | null;
  developmentStageId?: string | null;
  scheduledDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateTaskInput {
  title: string;
  priority: Priority;
  memo?: string;
  caseId?: string;
  isRequiredForCase?: boolean;
  assigneeUserId?: string;
  parentTaskId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  priority?: Priority;
  memo?: string | null;
  caseId?: string | null;
  isRequiredForCase?: boolean;
  assigneeUserId?: string | null;
}

export interface Case {
  id: string;
  name: string;
  startDate?: string | null;
  endDate: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CaseProgress {
  requiredTotal: number;
  requiredCompleted: number;
  requiredIncomplete: number;
  isOverdueWithIncomplete: boolean;
}

export interface User {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PublicUser extends User {
  email: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export type NonBusinessDayPolicy = "as_is" | "skip" | "next_business_day" | "previous_business_day";

/** design.md CaseRelativeAnchor — template schedule origin relative to a case. */
export type CaseRelativeAnchor =
  | "case_start"
  | "case_end"
  | "period_month_start"
  | "period_month_end";

/** design.md CaseTemplateApplyOperation — carried on case create/update. */
export type CaseTemplateApplyOperation =
  | "start_generate"
  | "start_regenerate"
  | "start_delete"
  | "end_generate"
  | "end_regenerate"
  | "end_delete"
  | "month_generate"
  | "month_regenerate"
  | "month_delete";

export interface RecurringTaskTemplate {
  id: string;
  title: string;
  priority: Priority;
  caseAnchor: CaseRelativeAnchor;
  caseOffsetDays: number;
  defaultMemo?: string | null;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface RegisterTemplateInput {
  title: string;
  priority: Priority;
  caseAnchor: CaseRelativeAnchor;
  caseOffsetDays: number;
  defaultMemo?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
}

/** design.md CaseCreateInput (wire: ISO date strings). */
export interface CreateCaseInput {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  templateOperations?: CaseTemplateApplyOperation[];
}

/** design.md CaseUpdateInput (wire: ISO date strings). */
export interface UpdateCaseInput {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  isCompleted?: boolean;
  templateOperations?: CaseTemplateApplyOperation[];
}

export interface NonBusinessDay {
  id: string;
  date: string;
  label?: string;
  source: "manual" | "external_api";
}

export type PeriodType = "week" | "month";

export interface ThroughputPeriod {
  periodStart: string;
  periodEnd: string;
  completedCount: number;
}

export interface ThroughputSummary {
  periods: ThroughputPeriod[];
  forecastNextPeriodCount: number | null;
}

export interface DevelopmentStage {
  id: string;
  name: string;
  order: number;
}

/** design.md WORKSPACE_COLORS — fixed identifier colors for workspaces. */
export const WORKSPACE_COLORS = [
  "#2563eb",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#6d28d9",
  "#475569",
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

/** Wire shape (ISO date strings), matching other FE entity types. */
export interface Workspace {
  id: string;
  name: string;
  color: WorkspaceColor;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceUserSummary {
  userId: string;
  name: string;
  email: string;
}

export interface CreateWorkspaceInput {
  name: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  color?: WorkspaceColor;
}

export function useApiClient() {
  const config = useRuntimeConfig();
  let csrfToken: string | undefined;
  let csrfInitialization: Promise<void> | undefined;

  async function request<T>(path: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
    const method = options?.method?.toUpperCase();
    const isMutating = method === "POST" || method === "PATCH" || method === "DELETE";
    if (isMutating && csrfInitialization) {
      await csrfInitialization;
    }

    const headers = csrfToken && isMutating
      ? { ...(options?.headers as Record<string, string> | undefined), "csrf-token": csrfToken }
      : options?.headers;

    return $fetch<T>(joinApiUrl(config.public.apiBaseUrl, path), {
      ...options,
      credentials: "include",
      ...(headers ? { headers } : {}),
    });
  }

  async function csrf(): Promise<string> {
    const { token } = await request<{ token: string }>("/api/auth/csrf");
    csrfToken = token;
    return token;
  }

  csrfInitialization = csrf().then(() => undefined).catch(() => undefined);

  return {
    request,

    // Users (design.md "Backend/users" API Contract)
    listUsers: (q?: string) =>
      q === undefined
        ? request<User[]>("/api/users")
        : request<User[]>("/api/users", { query: { q } }),

    // Auth (user-auth design.md API Contract)
    register: async (input: RegisterInput) => {
      const user = await request<PublicUser>("/api/auth/register", { method: "POST", body: input });
      await csrf();
      return user;
    },
    login: async (input: LoginInput) => {
      const user = await request<PublicUser>("/api/auth/login", { method: "POST", body: input });
      await csrf();
      return user;
    },
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
    me: () => request<PublicUser>("/api/auth/me"),
    csrf,

    // Tasks (design.md "Backend/tasks" API Contract)
    listTasks: (filter: { caseId?: string; assigneeUserId?: string; unassignedCase?: boolean } = {}) =>
      request<Task[]>("/api/tasks", {
        query: {
          ...filter,
          unassignedCase: filter.unassignedCase ? "true" : undefined,
        },
      }),
    createTask: (input: CreateTaskInput) => request<Task>("/api/tasks", { method: "POST", body: input }),
    getTask: (id: string) => request<Task>(`/api/tasks/${id}`),
    updateTask: (id: string, input: UpdateTaskInput) => request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: input }),
    addChildTask: (parentId: string, input: CreateTaskInput) =>
      request<Task>(`/api/tasks/${parentId}/children`, { method: "POST", body: input }),
    splitTask: (id: string, parts: CreateTaskInput[]) =>
      request<Task[]>(`/api/tasks/${id}/split`, { method: "POST", body: { parts } }),
    updateTaskStatus: (id: string, status: TaskStatus) =>
      request<Task>(`/api/tasks/${id}/status`, { method: "PATCH", body: { status } }),
    updateTaskDevelopmentStage: (id: string, developmentStageId: string | null, assigneeUserId?: string) =>
      request<Task>(`/api/tasks/${id}/development-stage`, {
        method: "PATCH",
        body: { developmentStageId, assigneeUserId },
      }),
    deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: "DELETE" }),

    // Cases (design.md "Backend/cases" API Contract + CaseService templateOperations)
    listCases: () => request<Case[]>("/api/cases"),
    createCase: (input: CreateCaseInput) =>
      request<Case>("/api/cases", { method: "POST", body: input }),
    updateCase: (id: string, input: UpdateCaseInput) =>
      request<Case>(`/api/cases/${id}`, { method: "PATCH", body: input }),
    getCaseProgress: (id: string) => request<CaseProgress>(`/api/cases/${id}/progress`),
    deleteCase: (id: string) => request<void>(`/api/cases/${id}`, { method: "DELETE" }),

    // Holidays (design.md "Backend/holidays" API Contract)
    listHolidays: () => request<NonBusinessDay[]>("/api/holidays"),
    registerHoliday: (input: { date: string; label?: string }) =>
      request<NonBusinessDay>("/api/holidays", { method: "POST", body: input }),
    deleteHoliday: (id: string) => request<void>(`/api/holidays/${id}`, { method: "DELETE" }),
    syncHolidays: () =>
      request<{ added: NonBusinessDay[]; skippedExisting: number }>("/api/holidays/sync", { method: "POST" }),

    // Recurrence (design.md RecurrenceService API — case-relative only)
    listRecurringTemplates: () => request<RecurringTaskTemplate[]>("/api/recurring-templates"),
    registerRecurringTemplate: (input: RegisterTemplateInput) =>
      request<RecurringTaskTemplate>("/api/recurring-templates", { method: "POST", body: input }),
    stopRecurringTemplate: (id: string) => request<void>(`/api/recurring-templates/${id}/stop`, { method: "POST" }),
    resumeRecurringTemplate: (id: string) =>
      request<void>(`/api/recurring-templates/${id}/resume`, { method: "POST" }),
    deleteRecurringTemplate: (id: string) => request<void>(`/api/recurring-templates/${id}`, { method: "DELETE" }),

    // Throughput (design.md "Backend/throughput" API Contract)
    getThroughput: (periodType: PeriodType, rangeCount: number) =>
      request<ThroughputSummary>("/api/throughput", { query: { periodType, rangeCount } }),

    // Development Stages (design.md "Backend/development-stages" API Contract)
    listDevelopmentStages: () => request<DevelopmentStage[]>("/api/development-stages"),
    createDevelopmentStage: (name: string) =>
      request<DevelopmentStage>("/api/development-stages", { method: "POST", body: { name } }),
    renameDevelopmentStage: (id: string, name: string) =>
      request<DevelopmentStage>(`/api/development-stages/${id}`, { method: "PATCH", body: { name } }),
    reorderDevelopmentStages: (orderedIds: string[]) =>
      request<DevelopmentStage[]>("/api/development-stages/reorder", { method: "POST", body: { orderedIds } }),
    deleteDevelopmentStage: (id: string) =>
      request<void>(`/api/development-stages/${id}`, { method: "DELETE" }),


    // Workspaces (workspace-membership design.md API Contract)
    listWorkspaces: () => request<Workspace[]>("/api/workspaces"),
    createWorkspace: (input: CreateWorkspaceInput) =>
      request<Workspace>("/api/workspaces", { method: "POST", body: input }),
    updateWorkspace: (id: string, input: UpdateWorkspaceInput) =>
      request<Workspace>(`/api/workspaces/${id}`, { method: "PATCH", body: input }),
    deleteWorkspace: (id: string) =>
      request<void>(`/api/workspaces/${id}`, { method: "DELETE" }),
    listWorkspaceMembers: (id: string) =>
      request<WorkspaceUserSummary[]>(`/api/workspaces/${id}/members`),
    searchAddableWorkspaceUsers: (id: string, q: string) =>
      request<WorkspaceUserSummary[]>(`/api/workspaces/${id}/searchable-users`, {
        query: { q },
      }),
    addWorkspaceMember: (id: string, userId: string) =>
      request<WorkspaceUserSummary>(`/api/workspaces/${id}/members`, {
        method: "POST",
        body: { userId },
      }),

    // Client errors (design.md "Backend/client-errors" API Contract)
    reportClientError: (input: { message: string; stack?: string; pageUrl: string; occurredAt: string }) =>
      request<void>("/api/client-errors", { method: "POST", body: input }),
  };
}
