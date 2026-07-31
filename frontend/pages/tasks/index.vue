<!--
  Task list with status/priority at a glance, hierarchy display, and split
  UI (task 11.1, design.md "Frontend/tasks", Requirements 1.1-1.6, 2.1-2.4).
  Assignee filtering reuses AssigneeFilter (task 11.6, Requirement 7.2).
-->
<script setup lang="ts">
const api = useApiClient();
const route = useRoute();

const tasks = ref<Task[]>([]);
const assigneeUserId = ref("");
const deliveryId = ref((route.query.deliveryId as string | undefined) ?? "");

const newTitle = ref("");
const newPriority = ref<Priority>("medium");
const newMemo = ref("");
const newAssigneeUserId = ref("");
const users = ref<User[]>([]);

const splitTarget = ref<Task | null>(null);
const splitPartTitles = ref(["", ""]);
const error = ref<string | null>(null);

const rootTasks = computed(() => tasks.value.filter((t) => !t.parentTaskId));
function childrenOf(taskId: string): Task[] {
  return tasks.value.filter((t) => t.parentTaskId === taskId);
}

async function load() {
  tasks.value = await api.listTasks({
    assigneeUserId: assigneeUserId.value || undefined,
    deliveryId: deliveryId.value || undefined,
  });
}

async function createTask() {
  await api.createTask({
    title: newTitle.value,
    priority: newPriority.value,
    memo: newMemo.value || undefined,
    deliveryId: deliveryId.value || undefined,
    // Requirement 7.1: assign to one pre-registered user at creation time.
    assigneeUserId: newAssigneeUserId.value || undefined,
  });
  newTitle.value = "";
  newMemo.value = "";
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

watch([assigneeUserId, deliveryId], load);
onMounted(async () => {
  await load();
  users.value = await api.listUsers();
});
</script>

<template>
  <section>
    <h1>タスク一覧</h1>

    <AssigneeFilter v-model="assigneeUserId" />
    <p v-if="error" role="alert" style="color: red">{{ error }}</p>

    <form @submit.prevent="createTask">
      <input v-model="newTitle" placeholder="タスク名" required />
      <select v-model="newPriority">
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <input v-model="newMemo" placeholder="メモ" />
      <select v-model="newAssigneeUserId">
        <option value="">担当者未設定</option>
        <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
      </select>
      <button type="submit">タスク登録</button>
    </form>

    <ul class="task-tree">
      <TaskNode
        v-for="task in rootTasks"
        :key="task.id"
        :task="task"
        :children="childrenOf(task.id)"
        :all-tasks="tasks"
        @status-change="onStatusChange"
        @split="openSplit"
      />
    </ul>

    <div v-if="splitTarget" class="split-form">
      <h2>「{{ splitTarget.title }}」を分割</h2>
      <div v-for="(_, index) in splitPartTitles" :key="index">
        <input v-model="splitPartTitles[index]" placeholder="分割後のタスク名" />
      </div>
      <button type="button" @click="splitPartTitles.push('')">分割項目を追加</button>
      <button type="button" @click="confirmSplit">分割を実行</button>
      <button type="button" @click="splitTarget = null">キャンセル</button>
    </div>
  </section>
</template>

<style scoped>
.task-tree,
.task-tree ul {
  list-style: none;
  padding-left: 1.25rem;
}
.split-form {
  border: 1px solid #ddd;
  padding: 1rem;
  margin-top: 1rem;
}
</style>
