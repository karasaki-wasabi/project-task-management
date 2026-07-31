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
  <section>
    <h1>開発段階マスタ</h1>

    <form @submit.prevent="createStage">
      <input v-model="newStageName" placeholder="段階名(例: 仕様未確定)" required />
      <button type="submit">登録</button>
    </form>

    <ol class="stage-list">
      <li v-for="(stage, index) in stages" :key="stage.id">
        <span>{{ stage.name }}</span>
        <button type="button" :disabled="index === 0" @click="moveStage(index, -1)">↑</button>
        <button type="button" :disabled="index === stages.length - 1" @click="moveStage(index, 1)">↓</button>
        <button type="button" @click="renameStage(stage)">名称変更</button>
        <button type="button" @click="deleteStage(stage.id)">削除</button>
      </li>
    </ol>

    <h2>カンバン</h2>
    <p v-if="stages.length === 0" class="empty-state">開発段階が未登録です。上のフォームから登録してください。</p>

    <div v-if="pendingMove" class="assignee-picker" role="dialog">
      <p>このタスクは担当者が未設定です。移動と同時に担当者を選択してください。</p>
      <select v-model="pendingAssigneeUserId">
        <option value="" disabled>担当者を選択</option>
        <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
      </select>
      <button type="button" :disabled="!pendingAssigneeUserId" @click="confirmPendingMove">確定</button>
      <button type="button" @click="cancelPendingMove">キャンセル</button>
    </div>

    <p class="pool-hint">
      「未割り当て」は開発段階マスタの列ではなく、カードのドラッグ元専用の一時置き場です(ドロップ先にはなりません)。
    </p>
    <div class="board">
      <div class="column unassigned-pool">
        <h3>未割り当て</h3>
        <ul
          class="card-list"
          @dragover.prevent
        >
          <li
            v-for="task in unassignedStageTasks"
            :key="task.id"
            class="card"
            draggable="true"
            :data-task-id="task.id"
            @dragstart="onDragStart(task.id)"
          >
            {{ task.title }}
          </li>
        </ul>
      </div>

      <div v-for="stage in stages" :key="stage.id" class="column" :data-stage-id="stage.id">
        <h3>{{ stage.name }}</h3>
        <ul class="card-list" @dragover.prevent @drop="onDropOnStage(stage.id)">
          <li
            v-for="task in tasksForStage(stage.id)"
            :key="task.id"
            class="card"
            draggable="true"
            :data-task-id="task.id"
            @dragstart="onDragStart(task.id)"
          >
            {{ task.title }}
            <span v-if="userName(task.assigneeUserId)" class="assignee">({{ userName(task.assigneeUserId) }})</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stage-list {
  padding-left: 1.5rem;
}
.stage-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
}
.board {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.column {
  min-width: 220px;
  background: #f7f7f7;
  border-radius: 4px;
  padding: 0.75rem;
}
.unassigned-pool {
  background: #eef2f7;
  border: 1px dashed #99a;
}
.pool-hint {
  color: #555;
  font-size: 0.9em;
}
.card-list {
  list-style: none;
  padding: 0;
  min-height: 3rem;
}
.card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  cursor: grab;
}
.assignee {
  color: #555;
  font-size: 0.85em;
}
.assignee-picker {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #fffbe6;
}
.empty-state {
  color: #555;
}
</style>
