<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  useApiClient,
  type Case,
  type CreateTaskInput,
  type DevelopmentStage,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
  type User,
} from "../../../../composables/useApiClient";
import { useAuth } from "../../../../composables/useAuth";

const api = useApiClient();
const route = useRoute();
const { user } = useAuth();

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

const workspaceId = routeParam(route.params.workspaceId as string | string[]);
const taskId = routeParam(route.params.taskId as string | string[]);

const task = ref<Task | null>(null);
const allTasks = ref<Task[]>([]);
const stages = ref<DevelopmentStage[]>([]);
const cases = ref<Case[]>([]);
const users = ref<User[]>([]);
const loading = ref(true);
const processing = ref(false);
const confirmingDelete = ref(false);
const error = ref<string | null>(null);
const timelineKey = ref(0);

const deleted = computed(() => task.value?.deletedAt != null);
const parentTask = computed(
  () => allTasks.value.find((candidate) => candidate.id === task.value?.parentTaskId) ?? null,
);
const childTasks = computed(() =>
  allTasks.value.filter((candidate) => candidate.parentTaskId === task.value?.id),
);
const taskListPath = computed(() => `/workspaces/${workspaceId}/tasks`);

function statusCode(caught: unknown): number | undefined {
  if (!caught || typeof caught !== "object") return undefined;
  const candidate = caught as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
  };
  return candidate.statusCode ?? candidate.status ?? candidate.response?.status;
}

function caughtMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const loadedTask = await api.getTask(taskId);
    const [taskList, stageList, caseList, members] = await Promise.all([
      api.listTasks(),
      api.listDevelopmentStages(),
      api.listCases(),
      api.listWorkspaceMembers(workspaceId),
    ]);

    task.value = loadedTask;
    allTasks.value = taskList;
    stages.value = stageList;
    cases.value = caseList;
    users.value = members.map((member) => ({
      id: member.userId,
      name: member.name,
      createdAt: "",
      updatedAt: "",
    }));
  } catch (caught) {
    if (statusCode(caught) === 404) {
      showError(
        createError({
          statusCode: 404,
          statusMessage: "タスクが見つかりません",
        }),
      );
      return;
    }
    error.value = caughtMessage(caught);
  } finally {
    loading.value = false;
  }
}

function updateTaskInLists(updated: Task) {
  task.value = updated;
  const index = allTasks.value.findIndex((candidate) => candidate.id === updated.id);
  if (index >= 0) {
    allTasks.value[index] = updated;
  }
  timelineKey.value += 1;
}

async function updateField(field: string, value: unknown) {
  if (!task.value || deleted.value) return;
  error.value = null;

  try {
    let updated: Task;
    if (field === "status") {
      updated = await api.updateTaskStatus(taskId, value as TaskStatus);
    } else if (field === "developmentStageId") {
      updated = await api.updateTaskDevelopmentStage(
        taskId,
        typeof value === "string" && value.length > 0 ? value : null,
      );
    } else if (field === "case") {
      const caseValue = value as {
        caseId: string | null;
        isRequiredForCase: boolean;
      };
      updated = await api.updateTask(taskId, caseValue);
    } else {
      const input = { [field]: value } as UpdateTaskInput;
      updated = await api.updateTask(taskId, input);
    }
    updateTaskInLists(updated);
  } catch (caught) {
    error.value = caughtMessage(caught);
    throw caught;
  }
}

function duplicateInput(source: Task): CreateTaskInput {
  return {
    title: source.title,
    priority: source.priority,
    ...(source.detail != null ? { detail: source.detail } : {}),
    ...(source.assigneeUserId != null ? { assigneeUserId: source.assigneeUserId } : {}),
    ...(source.caseId != null ? { caseId: source.caseId } : {}),
    isRequiredForCase: source.isRequiredForCase,
    ...(source.parentTaskId != null ? { parentTaskId: source.parentTaskId } : {}),
    ...(source.scheduledEndDate != null
      ? { scheduledEndDate: source.scheduledEndDate }
      : {}),
  };
}

async function duplicateTask() {
  if (!task.value || deleted.value) return;
  error.value = null;
  processing.value = true;
  try {
    const duplicate = await api.createTask(duplicateInput(task.value));
    await navigateTo(`/workspaces/${workspaceId}/tasks/${duplicate.id}`);
  } catch (caught) {
    error.value = caughtMessage(caught);
  } finally {
    processing.value = false;
  }
}

async function confirmDelete() {
  if (!task.value || deleted.value) return;
  error.value = null;
  processing.value = true;
  try {
    await api.deleteTask(taskId);
    await navigateTo(taskListPath.value);
  } catch (caught) {
    error.value = caughtMessage(caught);
    confirmingDelete.value = false;
  } finally {
    processing.value = false;
  }
}

function refreshTimeline() {
  timelineKey.value += 1;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="mx-auto w-full max-w-5xl space-y-6">
    <NuxtLink
      :to="taskListPath"
      class="inline-flex text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      ← タスク一覧へ
    </NuxtLink>

    <p v-if="loading" aria-live="polite" class="py-12 text-center text-sm text-slate-500">
      読み込み中...
    </p>

    <template v-else-if="task">
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="break-words text-2xl font-semibold tracking-tight text-slate-900">
              {{ task.title }}
            </h1>
            <span
              v-if="deleted"
              class="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              削除済み
            </span>
          </div>
          <p v-if="deleted" class="mt-2 text-sm text-slate-600">
            このタスクは参照専用です。コメントと操作ログは引き続き確認できます。
          </p>
        </div>

        <div v-if="!deleted" class="flex items-center gap-2">
          <button
            type="button"
            aria-label="タスクを複製"
            :disabled="processing"
            class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            @click="duplicateTask"
          >
            複製
          </button>
          <button
            type="button"
            aria-label="タスクを削除"
            :disabled="processing"
            class="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            @click="confirmingDelete = true"
          >
            削除
          </button>
        </div>
      </header>

      <ErrorAlert v-if="error" :message="error" />

      <section
        v-if="confirmingDelete && !deleted"
        role="alertdialog"
        aria-labelledby="delete-task-heading"
        class="rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <h2 id="delete-task-heading" class="font-semibold text-red-900">
          このタスクを削除しますか？
        </h2>
        <p class="mt-1 text-sm text-red-800">
          一覧からは外れますが、コメントと操作ログは保持されます。
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            aria-label="タスク削除を確定"
            :disabled="processing"
            class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            @click="confirmDelete"
          >
            {{ processing ? "削除中..." : "削除する" }}
          </button>
          <button
            type="button"
            :disabled="processing"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            @click="confirmingDelete = false"
          >
            キャンセル
          </button>
        </div>
      </section>

      <TaskFieldCard
        :task="task"
        :users="users"
        :stages="stages"
        :cases="cases"
        :parentTask="parentTask"
        :childTasks="childTasks"
        :editable="!deleted"
        :onUpdate="updateField"
      />

      <section v-if="!deleted" class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <CommentComposer
          :taskId="taskId"
          mode="create"
          @success="refreshTimeline"
        />
      </section>

      <TaskTimeline
        :key="timelineKey"
        :taskId="taskId"
        :currentUserId="user?.id ?? ''"
        :readOnly="deleted"
      />
    </template>

    <ErrorAlert v-else-if="error" :message="error" />
  </main>
</template>
