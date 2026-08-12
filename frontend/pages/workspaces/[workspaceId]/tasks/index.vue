<!--
  Task list with status/priority at a glance, hierarchy display, and split
  UI (task 11.1, design.md "Frontend/tasks", Requirements 1.1-1.6, 2.1-2.4).
  Assignee filtering reuses AssigneeFilter (task 11.6, Requirement 7.2).

  Explicit Vue / useApiClient imports so vitest can mount without Nuxt
  auto-import runtime (same approach as pages/holidays/index.vue).
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  useApiClient,
  type DevelopmentStage,
  type Priority,
  type Task,
  type TaskStatus,
  type User,
} from "../../../../composables/useApiClient";
import { useCurrentWorkspace } from "../../../../composables/useCurrentWorkspace";

const api = useApiClient();
const { currentId } = useCurrentWorkspace();

const tasks = ref<Task[]>([]);
const stages = ref<DevelopmentStage[]>([]);
const assigneeUserId = ref("");
const caseId = ref((useRoute().query.caseId as string | undefined) ?? "");

const newTitle = ref("");
const newPriority = ref<Priority>("medium");
const newMemo = ref("");
const newAssigneeUserId = ref("");
const newIsRequiredForCase = ref(false);
const users = ref<User[]>([]);

const splitTarget = ref<Task | null>(null);
const splitPartTitles = ref(["", ""]);
const error = ref<string | null>(null);

const rootTasks = computed(() => tasks.value.filter((t) => !t.parentTaskId));
function childrenOf(taskId: string): Task[] {
  return tasks.value.filter((t) => t.parentTaskId === taskId);
}

async function load() {
  if (currentId.value === null) return;
  const [taskList, stageList] = await Promise.all([
    api.listTasks({
      assigneeUserId: assigneeUserId.value || undefined,
      caseId: caseId.value || undefined,
    }),
    api.listDevelopmentStages(),
  ]);
  tasks.value = taskList;
  stages.value = stageList;
}

async function createTask() {
  await api.createTask({
    title: newTitle.value,
    priority: newPriority.value,
    memo: newMemo.value || undefined,
    caseId: caseId.value || undefined,
    // Requirement 3.3: only meaningful when the task is linked to a
    // case; found missing entirely from this form while writing task
    // 18.3's dashboard E2E test (no UI could ever mark a task required,
    // so a case's progress could never show a nonzero requiredTotal).
    isRequiredForCase: caseId.value ? newIsRequiredForCase.value : undefined,
    // Requirement 7.1: assign to one pre-registered user at creation time.
    assigneeUserId: newAssigneeUserId.value || undefined,
  });
  newTitle.value = "";
  newMemo.value = "";
  newIsRequiredForCase.value = false;
  await load();
}

async function onStatusChange(id: string, status: TaskStatus) {
  error.value = null;
  try {
    await api.updateTaskStatus(id, status);
    await load();
  } catch (e) {
    // Requirement 2.4: surface the backend's incomplete-children guard
    // (409) instead of letting it fail silently as an unhandled rejection.
    error.value = e instanceof Error ? e.message : String(e);
    await load();
  }
}

function openSplit(task: Task) {
  splitTarget.value = task;
  splitPartTitles.value = ["", ""];
}

async function confirmSplit() {
  if (!splitTarget.value) return;
  const parts = splitPartTitles.value
    .filter((title) => title.trim().length > 0)
    .map((title) => ({ title, priority: splitTarget.value!.priority }));
  await api.splitTask(splitTarget.value.id, parts);
  splitTarget.value = null;
  await load();
}

watch([assigneeUserId, caseId], () => {
  if (currentId.value === null) return;
  void load();
});

watch(
  currentId,
  (id) => {
    if (id === null) {
      tasks.value = [];
      stages.value = [];
      users.value = [];
      splitTarget.value = null;
      error.value = null;
      return;
    }
    void (async () => {
      await load();
      // Requirement 4.1 / design.md: assignee candidates are current
      // workspace members. Normalize WorkspaceUserSummary.userId → User.id
      // so existing option :value / :key keep working.
      const members = await api.listWorkspaceMembers(id);
      users.value = members.map((member) => ({
        id: member.userId,
        name: member.name,
        createdAt: "",
        updatedAt: "",
      }));
    })();
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold tracking-tight">タスク一覧</h1>

    <AssigneeFilter v-model="assigneeUserId" />
    <ErrorAlert v-if="error" :message="error" />

    <form
      class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      @submit.prevent="createTask"
    >
      <input
        v-model="newTitle"
        placeholder="タスク名"
        required
        class="min-w-40 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <select
        v-model="newPriority"
        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <input
        v-model="newMemo"
        placeholder="メモ"
        class="min-w-32 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <select
        v-model="newAssigneeUserId"
        class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">担当者未設定</option>
        <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
      </select>
      <label v-if="caseId" class="flex items-center gap-1.5 text-sm text-slate-700">
        <input v-model="newIsRequiredForCase" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
        必須タスク
      </label>
      <button
        type="submit"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        タスク登録
      </button>
    </form>

    <ul class="list-none space-y-1">
      <TaskNode
        v-for="task in rootTasks"
        :key="task.id"
        :task="task"
        :children="childrenOf(task.id)"
        :all-tasks="tasks"
        :stages="stages"
        @status-change="onStatusChange"
        @split="openSplit"
      />
    </ul>

    <div v-if="splitTarget" class="space-y-2 rounded-lg bg-white p-4 ring-1 ring-slate-200">
      <h2 class="text-sm font-semibold text-slate-900">「{{ splitTarget.title }}」を分割</h2>
      <div v-for="(_, index) in splitPartTitles" :key="index">
        <input
          v-model="splitPartTitles[index]"
          placeholder="分割後のタスク名"
          class="w-full max-w-sm rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div class="flex gap-2 pt-1">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="splitPartTitles.push('')"
        >
          分割項目を追加
        </button>
        <button
          type="button"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          @click="confirmSplit"
        >
          分割を実行
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="splitTarget = null"
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
</template>
