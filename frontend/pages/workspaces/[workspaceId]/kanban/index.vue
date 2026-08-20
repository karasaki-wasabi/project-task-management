
<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import {
  computeBacklogTasks,
  computeFocusedTasks,
  computeTaskProgressById,
  computeTasksForStage,
  computeWorkloadCounts,
} from "./index.helpers";
definePageMeta({ fullWidth: true });

const api = useApiClient();
const { currentId } = useCurrentWorkspace();
const stages = ref<DevelopmentStage[]>([]);

const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const cases = ref<Case[]>([]);
const pendingMove = ref<{ taskId: string; targetStageId: string } | null>(null);
const pendingAssigneeUserId = ref("");
const hoveredStageId = ref<string | null>(null);
const focusTrayError = ref<string | null>(null);

const focusTrayRef = ref<{ resync: () => void } | null>(null);
const backlogPanelRef = ref<{ resync: () => void } | null>(null);
const pendingMoveDialogRef = ref<HTMLElement | null>(null);

const boardRenderEpoch = ref(0);

async function revertOptimisticMove() {
  await nextTick();
  syncColumnTasks();
  backlogPanelRef.value?.resync?.();
  boardRenderEpoch.value += 1;
}

const moveStatusMessage = ref<string | null>(null);
let moveStatusTimer: ReturnType<typeof setTimeout> | null = null;

function announceMoveSuccess(message: string) {
  moveStatusMessage.value = message;
  if (moveStatusTimer) clearTimeout(moveStatusTimer);
  moveStatusTimer = setTimeout(() => {
    moveStatusMessage.value = null;
  }, 2500);
}

function stageName(stageId: string): string {
  return stages.value.find((s) => s.id === stageId)?.name ?? stageId;
}

function focusLane(selector: string) {
  const container = document.querySelector<HTMLElement>(selector);
  if (!container) return;
  const firstCard = container.querySelector<HTMLElement>(".card[data-task-id]");
  const fallback = container.matches("h2, button") ? container : container.querySelector<HTMLElement>("h2, button");
  (firstCard ?? fallback)?.focus();
  container.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
}

function focusColumn(stageId: string) {
  focusLane(`.column[data-stage-id="${stageId}"]`);
}

const detailTaskId = ref<string | null>(null);

useDialogFocusTrap(
  pendingMoveDialogRef,
  computed(() => pendingMove.value !== null),
);

const selectedAssigneeUserId = ref("");

const focusedTasks = computed(() =>
  computeFocusedTasks(tasks.value, selectedAssigneeUserId.value, stages.value),
);
const workloadCounts = computed(() => computeWorkloadCounts(tasks.value, users.value, stages.value));
const backlogTasks = computed(() => computeBacklogTasks(tasks.value));
const taskProgressById = computed(() => computeTaskProgressById(tasks.value, stages.value));

const columnTasksByStageId = reactive<Record<string, Task[]>>({});

function syncColumnTasks() {
  const nextIds = new Set(stages.value.map((s) => s.id));
  for (const key of Object.keys(columnTasksByStageId)) {
    if (!nextIds.has(key)) delete columnTasksByStageId[key];
  }
  for (const stage of stages.value) {
    columnTasksByStageId[stage.id] = computeTasksForStage(tasks.value, stage.id, "");
  }
}

watch([tasks, stages], syncColumnTasks, { immediate: true });

async function loadStages() {
  if (currentId.value === null) return;
  stages.value = await api.listDevelopmentStages();
}

async function loadCases() {
  if (currentId.value === null) return;
  cases.value = await api.listCases();
}

async function loadTasks() {
  if (currentId.value === null) return;
  tasks.value = await api.listTasks();
}

function userName(userId: string | null | undefined): string | undefined {
  return users.value.find((u) => u.id === userId)?.name;
}

async function onDropOnStage(targetStageId: string, taskId: string) {
  focusTrayError.value = null;
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task || task.developmentStageId === targetStageId) {
    syncColumnTasks();
    return;
  }

  if (!task.assigneeUserId) {
    pendingMove.value = { taskId, targetStageId };
    pendingAssigneeUserId.value = "";
    return;
  }

  try {
    await api.updateTaskDevelopmentStage(taskId, targetStageId);
    await loadTasks();
    announceMoveSuccess(`「${task.title}」を${stageName(targetStageId)}に移動しました`);
  } catch (e) {
    focusTrayError.value = e instanceof Error ? e.message : String(e);
    await revertOptimisticMove();
  }
}

async function handleColumnDragEnd(evt: DraggableEvent) {
  hoveredStageId.value = null;
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  const targetStageId = (evt.to as HTMLElement | undefined)?.dataset.stageId;
  if (taskId && targetStageId) {
    await onDropOnStage(targetStageId, taskId);
  }
}

function handleColumnChange(evt: DraggableEvent) {
  hoveredStageId.value = (evt.to as HTMLElement | undefined)?.dataset.stageId ?? null;
}

async function handleBacklogDragEnd(payload: { taskId: string; targetStageId?: string }) {
  hoveredStageId.value = null;
  if (payload.targetStageId) {
    await onDropOnStage(payload.targetStageId, payload.taskId);
  }
}

async function handleFocusTrayDragEnd(payload: { taskId: string; targetStageId?: string }) {
  hoveredStageId.value = null;
  if (payload.targetStageId) {
    await onDropOnStage(payload.targetStageId, payload.taskId);
  }
}

async function handleFocusTrayAssign(taskId: string) {
  focusTrayError.value = null;
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task || !selectedAssigneeUserId.value) {
    focusTrayRef.value?.resync();
    return;
  }
  if (task.assigneeUserId === selectedAssigneeUserId.value) {
    focusTrayRef.value?.resync();
    return;
  }
  try {
    await api.updateTask(taskId, { assigneeUserId: selectedAssigneeUserId.value });
    await loadTasks();
    announceMoveSuccess(`「${task.title}」を${userName(selectedAssigneeUserId.value) ?? ""}に割り当てました`);
  } catch (e) {
    focusTrayError.value = e instanceof Error ? e.message : String(e);
    await revertOptimisticMove();
  }
  focusTrayRef.value?.resync();
}

function openTaskDetail(taskId: string) {
  detailTaskId.value = taskId;
}

function closeTaskDetail() {
  detailTaskId.value = null;
}

async function onTaskDetailSaved(task: Task) {
  await loadTasks();
  announceMoveSuccess(`「${task.title}」を更新しました`);
}

async function onTaskDetailDeleted(deleted: { id: string; title: string }) {
  detailTaskId.value = null;
  await loadTasks();
  announceMoveSuccess(`「${deleted.title}」を削除しました`);
}

async function confirmPendingMove() {
  if (!pendingMove.value || !pendingAssigneeUserId.value) return;
  const task = tasks.value.find((t) => t.id === pendingMove.value?.taskId);
  const { taskId, targetStageId } = pendingMove.value;
  const assigneeUserId = pendingAssigneeUserId.value;
  focusTrayError.value = null;
  try {
    await api.updateTaskDevelopmentStage(taskId, targetStageId, assigneeUserId);
    pendingMove.value = null;
    pendingAssigneeUserId.value = "";
    await loadTasks();
    if (task) announceMoveSuccess(`「${task.title}」を${stageName(targetStageId)}に移動しました`);
  } catch (e) {
    focusTrayError.value = e instanceof Error ? e.message : String(e);
    await revertOptimisticMove();
  }
}

async function cancelPendingMove() {
  pendingMove.value = null;
  pendingAssigneeUserId.value = "";
  await revertOptimisticMove();
  focusTrayRef.value?.resync();
}

watch(
  currentId,
  (id) => {
    if (id === null) {
      stages.value = [];
      tasks.value = [];
      users.value = [];
      cases.value = [];
      return;
    }
    void (async () => {
      await loadStages();
      await loadTasks();
      const members = await api.listWorkspaceMembers(id);
      users.value = members.map((member) => ({
        id: member.userId,
        name: member.name,
        createdAt: "",
        updatedAt: "",
      }));
      await loadCases();
    })();
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">カンバン</h1>
      <NuxtLink
        :to="currentId ? workspacePath(currentId, 'kanban/stages') : '#'"
        class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        開発段階の管理
      </NuxtLink>
    </div>

    <p v-if="moveStatusMessage" role="status" aria-live="polite" class="rounded-md bg-green-100 px-3 py-2 text-sm text-green-700">
      {{ moveStatusMessage }}
    </p>

    <ErrorAlert v-if="focusTrayError" :message="focusTrayError" />

    <nav aria-label="レーンへ移動" class="flex flex-wrap gap-2">
      <button
        type="button"
        class="sr-only focus:not-sr-only focus:relative focus:z-20 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
        @click="focusLane('.backlog-panel')"
      >
        未割り当てへ移動
      </button>
      <button
        v-if="selectedAssigneeUserId"
        type="button"
        class="sr-only focus:not-sr-only focus:relative focus:z-20 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
        @click="focusLane('.focus-tray')"
      >
        担当者フォーカスへ移動
      </button>
      <button
        v-for="stage in stages"
        :key="`jump-${stage.id}`"
        type="button"
        class="sr-only focus:not-sr-only focus:relative focus:z-20 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
        @click="focusColumn(stage.id)"
      >
        {{ stage.name }}へ移動
      </button>
    </nav>

    <TeamWorkloadSummary v-model="selectedAssigneeUserId" :counts="workloadCounts" />

    <template v-if="selectedAssigneeUserId">
      <AssigneeFocusTray
        ref="focusTrayRef"
        :tasks="focusedTasks"
        :users="users"
        @assign="handleFocusTrayAssign"
        @end="handleFocusTrayDragEnd"
        @card-activate="openTaskDetail"
      />
    </template>

    <p v-if="stages.length === 0" class="text-sm text-slate-600">
      開発段階が未登録です。「開発段階の管理」から登録してください。
    </p>

    <div
      v-if="pendingMove"
      ref="pendingMoveDialogRef"
      class="assignee-picker space-y-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200"
      role="dialog"
      aria-modal="true"
      aria-label="担当者を選択"
      @keydown.esc="cancelPendingMove"
    >
      <p class="text-sm text-amber-900">このタスクは担当者が未設定です。移動と同時に担当者を選択してください。</p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="pendingAssigneeUserId"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="" disabled>担当者を選択</option>
          <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
        </select>
        <button
          type="button"
          :disabled="!pendingAssigneeUserId"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
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

    <TaskDetailModal
      :task-id="detailTaskId"
      :users="users"
      :stages="stages"
      :cases="cases"
      @close="closeTaskDetail"
      @saved="onTaskDetailSaved"
      @deleted="onTaskDetailDeleted"
    />

    <div class="board flex items-start gap-4 overflow-x-auto pb-2">
      <UnassignedBacklogPanel
        ref="backlogPanelRef"
        :tasks="backlogTasks"
        :users="users"
        @end="handleBacklogDragEnd"
        @card-activate="openTaskDetail"
      />

      <div
        v-for="stage in stages"
        :key="stage.id"
        class="column w-72 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors"
        :class="{ 'kanban-drop-target-active': hoveredStageId === stage.id }"
        :data-stage-id="stage.id"
      >
        <div class="mb-3 flex items-center gap-2 px-1">
          <h2 class="text-sm font-semibold text-slate-700" tabindex="-1">{{ stage.name }}</h2>
          <Badge tone="neutral" :label="String((columnTasksByStageId[stage.id] ?? []).length)" />
        </div>
        <VueDraggable
          :key="`${stage.id}-${boardRenderEpoch}`"
          :model-value="columnTasksByStageId[stage.id] ?? []"
          @update:model-value="(val: Task[]) => (columnTasksByStageId[stage.id] = val)"
          :group="{ name: 'kanban-cards', pull: true, put: true }"
          :sort="false"
          :animation="200"
          :force-fallback="true"
          :fallback-on-body="true"
          ghost-class="task-card-ghost"
          chosen-class="task-card-chosen"
          fallback-class="task-card-drag-clone"
          :on-move="preventSameListMove"
          class="card-list min-h-12 max-h-[36rem] space-y-2 overflow-y-auto"
          :data-stage-id="stage.id"
          @change="handleColumnChange"
          @end="handleColumnDragEnd"
        >
          <TaskCard
            v-for="task in columnTasksByStageId[stage.id] ?? []"
            :key="task.id"
            :task="task"
            :assigneeId="task.assigneeUserId ?? undefined"
            :assigneeName="userName(task.assigneeUserId)"
            :progress="taskProgressById.get(task.id)"
            :is-terminal-column="stage.kind === 'completed' || stage.kind === 'cancelled'"
            @activate="openTaskDetail(task.id)"
          />
        </VueDraggable>
      </div>
    </div>
  </div>
</template>
