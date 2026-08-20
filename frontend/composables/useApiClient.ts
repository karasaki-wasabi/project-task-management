export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export type TaskStatus = "not_started" | "in_progress" | "ready_for_handoff" | "on_hold";
export type Priority = "high" | "medium" | "low";
export type DevelopmentStageKind = "normal" | "completed" | "cancelled";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  detail?: string | null;
  caseId?: string | null;
  isRequiredForCase: boolean;
  parentTaskId?: string | null;
  assigneeUserId?: string | null;
  sourceTemplateId?: string | null;
  developmentStageId?: string | null;
  scheduledEndDate?: string | null;
  storyPoints?: number | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateTaskInput {
  title: string;
  priority: Priority;
  detail?: string;
  caseId?: string;
  isRequiredForCase?: boolean;
  assigneeUserId?: string;
  parentTaskId?: string;
  scheduledEndDate?: string;
  storyPoints?: number;
}

export interface UpdateTaskInput {
  title?: string;
  priority?: Priority;
  detail?: string | null;
  caseId?: string | null;
  isRequiredForCase?: boolean;
  assigneeUserId?: string | null;
  parentTaskId?: string | null;
  scheduledEndDate?: string | null;
  storyPoints?: number | null;
}

export interface TaskListFilter {
  caseId?: string;
  assigneeUserId?: string;
  unassignedCase?: boolean;
  titleContains?: string;
  excludeSubtreeOf?: string;
  excludeClosed?: boolean;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorUserId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type TaskTimelineFilter = "all" | "comments" | "changes";

export interface TaskTimelineOptions {
  filter?: TaskTimelineFilter;
  cursor?: string;
  limit?: number;
}

export interface TaskTimelineComment extends TaskComment {
  type: "comment";
  occurredAt: string;
}

export interface TaskTimelineChange {
  id: string;
  taskId: string;
  actorUserId: string | null;
  actorSourceLabel: string | null;
  operationType: "field_changed";
  fieldName:
    | "title"
    | "status"
    | "priority"
    | "detail"
    | "assignee"
    | "case"
    | "isRequiredForCase"
    | "developmentStage"
    | "parentTask"
    | "scheduledEndDate";
  beforeValue: string | null;
  afterValue: string | null;
  occurredAt: string;
  type: "change";
}

export type TaskTimelineEntry = TaskTimelineComment | TaskTimelineChange;

export interface TaskTimelinePage {
  items: TaskTimelineEntry[];
  nextCursor: string | null;
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

export type CaseRelativeAnchor =
  | "case_start"
  | "case_end"
  | "period_month_start"
  | "period_month_end";

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
  defaultDetail?: string | null;
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
  defaultDetail?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
}

export interface CreateCaseInput {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  templateOperations?: CaseTemplateApplyOperation[];
}

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
  completedPoints: number;
}

export interface CaseOutlook {
  openTaskCount: number;
  openPoints: number;
  requiredPeriods: number | null;
  remainingPeriods: number | null;
  marginPoints: number | null;
}

export interface ThroughputSummary {
  periods: ThroughputPeriod[];
  forecastNextPeriodCount: number | null;
  forecastNextPeriodPoints: number | null;
  caseOutlook?: CaseOutlook;
}

export interface DevelopmentStage {
  id: string;
  name: string;
  order: number;
  kind: DevelopmentStageKind;
}

export const WORKSPACE_COLORS = [
  "#2563eb",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#6d28d9",
  "#475569",
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

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

const WORKSPACE_SCOPED_PATH_PREFIXES = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
  "/api/throughput",
] as const;

function isWorkspaceScopedPath(path: string): boolean {
  return WORKSPACE_SCOPED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function fetchStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const candidate = error as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
  };
  return candidate.statusCode ?? candidate.status ?? candidate.response?.status;
}

export function useApiClient() {
  const config = useRuntimeConfig();
  const { currentId, workspaces, refresh, relocateAfterWorkspaceLost } = useCurrentWorkspace();
  let csrfToken: string | undefined;
  let csrfInitialization: Promise<void> | undefined;

  async function request<T>(path: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
    const method = options?.method?.toUpperCase();
    const isMutating = method === "POST" || method === "PATCH" || method === "DELETE";
    if (isMutating && csrfInitialization) {
      await csrfInitialization;
    }

    const workspaceId = isWorkspaceScopedPath(path) ? currentId.value : null;

    let headers = options?.headers as Record<string, string> | undefined;
    if (csrfToken && isMutating) {
      headers = { ...headers, "csrf-token": csrfToken };
    }
    if (workspaceId) {
      headers = { ...headers, "x-workspace-id": workspaceId };
    }

    try {
      return await $fetch<T>(joinApiUrl(config.public.apiBaseUrl, path), {
        ...options,
        credentials: "include",
        ...(headers ? { headers } : {}),
      });
    } catch (error) {
      if (
        fetchStatusCode(error) === 403 &&
        isWorkspaceScopedPath(path) &&
        workspaceId
      ) {
        await refresh();
        if (!workspaces.value.some((workspace) => workspace.id === workspaceId)) {
          relocateAfterWorkspaceLost(workspaceId);
        }
      }
      throw error;
    }
  }

  async function csrf(): Promise<string> {
    const { token } = await request<{ token: string }>("/api/auth/csrf");
    csrfToken = token;
    return token;
  }

  csrfInitialization = csrf().then(() => undefined).catch(() => undefined);

  return {
    request,

    listUsers: (q?: string) =>
      q === undefined
        ? request<User[]>("/api/users")
        : request<User[]>("/api/users", { query: { q } }),

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

    listTasks: (filter: TaskListFilter = {}) => {
      const { excludeClosed, ...rest } = filter;
      return request<Task[]>("/api/tasks", {
        query: {
          ...rest,
          unassignedCase: filter.unassignedCase ? "true" : undefined,
          ...(excludeClosed ? { excludeClosed: "true" } : {}),
        },
      });
    },
    createTask: (input: CreateTaskInput) => request<Task>("/api/tasks", { method: "POST", body: input }),
    getTask: (id: string) => request<Task>(`/api/tasks/${id}`),
    getTaskTimeline: (id: string, options: TaskTimelineOptions) =>
      request<TaskTimelinePage>(`/api/tasks/${id}/timeline`, { query: options }),
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
    createComment: (taskId: string, body: string) =>
      request<TaskComment>(`/api/tasks/${taskId}/comments`, { method: "POST", body: { body } }),
    updateComment: (taskId: string, commentId: string, body: string) =>
      request<TaskComment>(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: "PATCH",
        body: { body },
      }),
    deleteComment: (taskId: string, commentId: string) =>
      request<void>(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),

    listCases: () => request<Case[]>("/api/cases"),
    createCase: (input: CreateCaseInput) =>
      request<Case>("/api/cases", { method: "POST", body: input }),
    updateCase: (id: string, input: UpdateCaseInput) =>
      request<Case>(`/api/cases/${id}`, { method: "PATCH", body: input }),
    getCaseProgress: (id: string) => request<CaseProgress>(`/api/cases/${id}/progress`),
    deleteCase: (id: string) => request<void>(`/api/cases/${id}`, { method: "DELETE" }),

    listHolidays: () => request<NonBusinessDay[]>("/api/holidays"),
    registerHoliday: (input: { date: string; label?: string }) =>
      request<NonBusinessDay>("/api/holidays", { method: "POST", body: input }),
    deleteHoliday: (id: string) => request<void>(`/api/holidays/${id}`, { method: "DELETE" }),
    syncHolidays: () =>
      request<{ added: NonBusinessDay[]; skippedExisting: number }>("/api/holidays/sync", { method: "POST" }),

    listRecurringTemplates: () => request<RecurringTaskTemplate[]>("/api/recurring-templates"),
    registerRecurringTemplate: (input: RegisterTemplateInput) =>
      request<RecurringTaskTemplate>("/api/recurring-templates", { method: "POST", body: input }),
    stopRecurringTemplate: (id: string) => request<void>(`/api/recurring-templates/${id}/stop`, { method: "POST" }),
    resumeRecurringTemplate: (id: string) =>
      request<void>(`/api/recurring-templates/${id}/resume`, { method: "POST" }),
    deleteRecurringTemplate: (id: string) => request<void>(`/api/recurring-templates/${id}`, { method: "DELETE" }),

    getThroughput: (periodType: PeriodType, rangeCount: number, caseId?: string) =>
      request<ThroughputSummary>("/api/throughput", {
        query: { periodType, rangeCount, ...(caseId !== undefined ? { caseId } : {}) },
      }),

    listDevelopmentStages: () => request<DevelopmentStage[]>("/api/development-stages"),
    createDevelopmentStage: (name: string) =>
      request<DevelopmentStage>("/api/development-stages", { method: "POST", body: { name } }),
    renameDevelopmentStage: (id: string, name: string) =>
      request<DevelopmentStage>(`/api/development-stages/${id}`, { method: "PATCH", body: { name } }),
    reorderDevelopmentStages: (orderedIds: string[]) =>
      request<DevelopmentStage[]>("/api/development-stages/reorder", { method: "POST", body: { orderedIds } }),
    deleteDevelopmentStage: (id: string) =>
      request<void>(`/api/development-stages/${id}`, { method: "DELETE" }),

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

    reportClientError: (input: { message: string; stack?: string; pageUrl: string; occurredAt: string }) =>
      request<void>("/api/client-errors", { method: "POST", body: input }),
  };
}
