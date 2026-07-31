<!--
  Development stage master management (task 17.2, design.md
  "Frontend/kanban", Requirement 12.1) + kanban board / card movement
  (task 17.3, Requirements 12.2-12.4, 12.6-12.8). Drag and drop uses the
  browser-standard HTML5 Drag and Drop API (design.md Technology Stack:
  default choice, library swap allowed later if UX warrants it).

  Judgment call (requirements.md/design.md are silent on this): a task
  never has a development stage until someone sets one, and Requirement
  12.4 excludes stage-less tasks from the kanban's stage columns — so an
  additional "未割り当て" pool (not one of the master-driven stage columns)
  is shown as the drag SOURCE for stage-less tasks. Dragging out of it is
  how a task gets its first stage; it is not itself a valid drop target.
-->
<script setup lang="ts">
const api = useApiClient();
const stages = ref<DevelopmentStage[]>([]);
const newStageName = ref("");

const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const draggedTaskId = ref<string | null>(null);
const pendingMove = ref<{ taskId: string; targetStageId: string } | null>(null);
const pendingAssigneeUserId = ref("");

async function loadStages() {
  stages.value = await api.listDevelopmentStages();
}

async function loadTasks() {
  tasks.value = await api.listTasks();
}

const unassignedStageTasks = computed(() => tasks.value.filter((t) => !t.developmentStageId));
function tasksForStage(stageId: string): Task[] {
  return tasks.value.filter((t) => t.developmentStageId === stageId);
}
function userName(userId: string | null | undefined): string | undefined {
  return users.value.find((u) => u.id === userId)?.name;
}

async function createStage() {
  await api.createDevelopmentStage(newStageName.value);
  newStageName.value = "";
  await loadStages();
}

async function renameStage(stage: DevelopmentStage) {
  const name = window.prompt("新しい名称", stage.name);
  if (!name) return;
  await api.renameDevelopmentStage(stage.id, name);
  await loadStages();
}

async function moveStage(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= stages.value.length) return;
  const orderedIds = stages.value.map((s) => s.id);
  [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
  await api.reorderDevelopmentStages(orderedIds);
  await loadStages();
}

async function deleteStage(id: string) {
  await api.deleteDevelopmentStage(id);
  await loadStages();
}

function onDragStart(taskId: string) {
  draggedTaskId.value = taskId;
}

async function onDropOnStage(targetStageId: string) {
  const taskId = draggedTaskId.value;
  draggedTaskId.value = null;
  if (!taskId) return;
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task || task.developmentStageId === targetStageId) return;

  if (!task.assigneeUserId) {
    pendingMove.value = { taskId, targetStageId };
    pendingAssigneeUserId.value = "";
    return;
  }
  await api.updateTaskDevelopmentStage(taskId, targetStageId);
  await loadTasks();
}

async function confirmPendingMove() {
  if (!pendingMove.value || !pendingAssigneeUserId.value) return;
  await api.updateTaskDevelopmentStage(pendingMove.value.taskId, pendingMove.value.targetStageId, pendingAssigneeUserId.value);
  pendingMove.value = null;
  pendingAssigneeUserId.value = "";
  await loadTasks();
}

function cancelPendingMove() {
  pendingMove.value = null;
  pendingAssigneeUserId.value = "";
}

onMounted(async () => {
  await loadStages();
  await loadTasks();
  users.value = await api.listUsers();
});
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-4">
      <h1 class="text-xl font-semibold tracking-tight">開発段階マスタ</h1>

      <form
        class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200"
        @submit.prevent="createStage"
      >
        <input
          v-model="newStageName"
          placeholder="段階名(例: 仕様未確定)"
          required
          class="min-w-56 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          登録
        </button>
      </form>

      <ol class="stage-list list-none space-y-1">
        <li
          v-for="(stage, index) in stages"
          :key="stage.id"
          class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"
        >
          <span class="flex-1 text-sm font-medium text-slate-900">{{ stage.name }}</span>
          <button
            type="button"
            :disabled="index === 0"
            class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            @click="moveStage(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :disabled="index === stages.length - 1"
            class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            @click="moveStage(index, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            @click="renameStage(stage)"
          >
            名称変更
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            @click="deleteStage(stage.id)"
          >
            削除
          </button>
        </li>
      </ol>
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-semibold tracking-tight">カンバン</h2>
      <p v-if="stages.length === 0" class="text-sm text-slate-600">
        開発段階が未登録です。上のフォームから登録してください。
      </p>

      <div v-if="pendingMove" class="assignee-picker space-y-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200" role="dialog">
        <p class="text-sm text-amber-900">このタスクは担当者が未設定です。移動と同時に担当者を選択してください。</p>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="pendingAssigneeUserId"
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" disabled>担当者を選択</option>
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
          </select>
          <button
            type="button"
            :disabled="!pendingAssigneeUserId"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            @click="confirmPendingMove"
          >
            確定
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="cancelPendingMove"
          >
            キャンセル
          </button>
        </div>
      </div>

      <p class="pool-hint text-sm text-slate-500">
        「未割り当て」は開発段階マスタの列ではなく、カードのドラッグ元専用の一時置き場です(ドロップ先にはなりません)。
      </p>
      <div class="board flex items-start gap-4 overflow-x-auto pb-2">
        <div class="column unassigned-pool min-w-56 rounded-lg border border-dashed border-slate-300 bg-slate-100 p-3">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">未割り当て</h3>
          <ul class="card-list min-h-12 list-none space-y-2" @dragover.prevent>
            <li
              v-for="task in unassignedStageTasks"
              :key="task.id"
              class="card cursor-grab rounded-md bg-white p-2 text-sm ring-1 ring-slate-200"
              draggable="true"
              :data-task-id="task.id"
              @dragstart="onDragStart(task.id)"
            >
              {{ task.title }}
            </li>
          </ul>
        </div>

        <div
          v-for="stage in stages"
          :key="stage.id"
          class="column min-w-56 rounded-lg bg-slate-50 p-3"
          :data-stage-id="stage.id"
        >
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{{ stage.name }}</h3>
          <ul class="card-list min-h-12 list-none space-y-2" @dragover.prevent @drop="onDropOnStage(stage.id)">
            <li
              v-for="task in tasksForStage(stage.id)"
              :key="task.id"
              class="card cursor-grab rounded-md bg-white p-2 text-sm ring-1 ring-slate-200"
              draggable="true"
              :data-task-id="task.id"
              @dragstart="onDragStart(task.id)"
            >
              {{ task.title }}
              <span v-if="userName(task.assigneeUserId)" class="assignee ml-1 text-xs text-slate-500"
                >({{ userName(task.assigneeUserId) }})</span
              >
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
