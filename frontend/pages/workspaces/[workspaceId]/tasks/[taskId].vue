<script setup lang="ts">
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

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function saveTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";
  if (title.length === 0) {
    throw new Error("タイトルは必須です。");
  }
  return updateField("title", title);
}

function onTitleKeydown(event: KeyboardEvent, save: () => Promise<void>) {
  if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void save();
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
    error.value = apiErrorMessage(caught);
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
    const message = apiErrorMessage(caught);
    error.value = message;
    throw new Error(message);
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
    error.value = apiErrorMessage(caught);
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
    error.value = apiErrorMessage(caught);
    confirmingDelete.value = false;
  } finally {
    processing.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="mx-auto w-full max-w-5xl space-y-6">
    <p v-if="loading" aria-live="polite" class="py-12 text-center text-sm text-slate-500">
      読み込み中...
    </p>

    <template v-else-if="task">
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <InlineEditableField
              class="-mx-2 w-full min-w-0 max-w-full"
              label="タイトル"
              placement="inline"
              surface="plain"
              replaceDisplay
              :modelValue="task.title"
              :editable="!deleted"
              :onSave="saveTitle"
            >
              <template #default="{ value }">
                <h1 class="break-words text-2xl font-semibold tracking-tight text-slate-900">
                  {{ value }}
                </h1>
              </template>
              <template #picker="{ draftValue, setDraftValue, save, cancel, saving }">
                <form class="flex flex-col gap-2" @submit.prevent="save">
                  <input
                    :value="typeof draftValue === 'string' ? draftValue : ''"
                    aria-label="タイトルを入力"
                    autofocus
                    :disabled="saving"
                    class="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-2xl font-semibold tracking-tight text-slate-900 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/35 disabled:cursor-not-allowed disabled:bg-slate-100"
                    @input="setDraftValue(inputValue($event))"
                    @keydown="onTitleKeydown($event, save)"
                  >
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      :disabled="saving"
                      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      @click="cancel"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      :disabled="saving"
                      class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {{ saving ? "送信中..." : "更新" }}
                    </button>
                  </div>
                </form>
              </template>
            </InlineEditableField>
            <span
              v-if="deleted"
              class="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              削除済み
            </span>
          </div>
          <p v-if="deleted" class="mt-2 text-sm text-slate-600">
            このタスクは削除されています。閲覧のみ可能です。
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
        :workspaceId="workspaceId"
        :editable="!deleted"
        :currentUserId="user?.id ?? ''"
        :onUpdate="updateField"
      />

      <TaskTimeline
        :key="timelineKey"
        :taskId="taskId"
        :currentUserId="user?.id ?? ''"
        :readOnly="deleted"
        :users="users"
        :cases="cases"
        :stages="stages"
        :tasks="allTasks"
      />
    </template>

    <ErrorAlert v-else-if="error" :message="error" />
  </main>
</template>
