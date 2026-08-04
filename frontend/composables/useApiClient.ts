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
  deliveryId?: string | null;
  isRequiredForDelivery: boolean;
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
  deliveryId?: string;
  isRequiredForDelivery?: boolean;
  assigneeUserId?: string;
  parentTaskId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  priority?: Priority;
  memo?: string | null;
  deliveryId?: string | null;
  isRequiredForDelivery?: boolean;
  assigneeUserId?: string | null;
}

export interface Delivery {
  id: string;
  name: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DeliveryProgress {
  requiredTotal: number;
  requiredCompleted: number;
  requiredIncomplete: number;
  isOverdueWithIncomplete: boolean;
}

export interface AppEvent {
  id: string;
  title: string;
  occursAt: string;
  deliveryId?: string | null;
  assigneeUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface User {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type RecurrenceKind = "fixed_interval" | "delivery_relative";
export type IntervalUnit = "day" | "week" | "month";
export type NonBusinessDayPolicy = "as_is" | "skip" | "next_business_day" | "previous_business_day";

export interface RecurringTaskTemplate {
  id: string;
  title: string;
  priority: Priority;
  kind: RecurrenceKind;
  intervalUnit?: IntervalUnit | null;
  intervalValue?: number | null;
  boundDeliveryId?: string | null;
  deliveryOffsetDays?: number | null;
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
  kind: RecurrenceKind;
  intervalUnit?: IntervalUnit;
  intervalValue?: number;
  boundDeliveryId?: string;
  deliveryOffsetDays?: number;
  defaultMemo?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
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

export function useApiClient() {
  const config = useRuntimeConfig();

  function request<T>(path: string, options?: Parameters<typeof $fetch>[1]): Promise<T> {
    return $fetch<T>(joinApiUrl(config.public.apiBaseUrl, path), options);
  }

  return {
    request,

    // Users (design.md "Backend/users" API Contract)
    listUsers: () => request<User[]>("/api/users"),
    createUser: (name: string) => request<User>("/api/users", { method: "POST", body: { name } }),
    deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: "DELETE" }),

    // Tasks (design.md "Backend/tasks" API Contract)
    listTasks: (filter: { deliveryId?: string; assigneeUserId?: string } = {}) =>
      request<Task[]>("/api/tasks", { query: filter }),
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

    // Deliveries (design.md "Backend/deliveries" API Contract)
    listDeliveries: () => request<Delivery[]>("/api/deliveries"),
    createDelivery: (input: { name: string; dueDate: string }) =>
      request<Delivery>("/api/deliveries", { method: "POST", body: input }),
    updateDeliveryDueDate: (id: string, dueDate: string) =>
      request<Delivery>(`/api/deliveries/${id}`, { method: "PATCH", body: { dueDate } }),
    getDeliveryProgress: (id: string) => request<DeliveryProgress>(`/api/deliveries/${id}/progress`),
    deleteDelivery: (id: string) => request<void>(`/api/deliveries/${id}`, { method: "DELETE" }),

    // Events (design.md "Backend/events" API Contract)
    listEvents: (filter: { assigneeUserId?: string } = {}) => request<AppEvent[]>("/api/events", { query: filter }),
    createEvent: (input: { title: string; occursAt: string; deliveryId?: string; assigneeUserId?: string }) =>
      request<AppEvent>("/api/events", { method: "POST", body: input }),
    deleteEvent: (id: string) => request<void>(`/api/events/${id}`, { method: "DELETE" }),

    // Holidays (design.md "Backend/holidays" API Contract)
    listHolidays: () => request<NonBusinessDay[]>("/api/holidays"),
    registerHoliday: (input: { date: string; label?: string }) =>
      request<NonBusinessDay>("/api/holidays", { method: "POST", body: input }),
    deleteHoliday: (id: string) => request<void>(`/api/holidays/${id}`, { method: "DELETE" }),
    syncHolidays: () =>
      request<{ added: NonBusinessDay[]; skippedExisting: number }>("/api/holidays/sync", { method: "POST" }),

    // Recurrence (design.md "Backend/recurrence" API Contract)
    listRecurringTemplates: () => request<RecurringTaskTemplate[]>("/api/recurring-templates"),
    registerRecurringTemplate: (input: RegisterTemplateInput) =>
      request<RecurringTaskTemplate>("/api/recurring-templates", { method: "POST", body: input }),
    stopRecurringTemplate: (id: string) => request<void>(`/api/recurring-templates/${id}/stop`, { method: "POST" }),
    deleteRecurringTemplate: (id: string) => request<void>(`/api/recurring-templates/${id}`, { method: "DELETE" }),
    generateDueInstances: (asOf?: string) =>
      request<Task[]>("/api/recurring-templates/generate-due", { method: "POST", body: { asOf } }),

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

    // Client errors (design.md "Backend/client-errors" API Contract)
    reportClientError: (input: { message: string; stack?: string; pageUrl: string; occurredAt: string }) =>
      request<void>("/api/client-errors", { method: "POST", body: input }),
  };
}
