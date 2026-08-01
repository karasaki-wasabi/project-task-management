<!--
  Kanban board page (task 4.2, design.md "kanban/index.vue" component
  detail block, Requirements 1.1/1.4/1.5, 2.4/2.5, 3.2/3.3, 4.1-4.3,
  6.1/6.2, 7.2). Development stage master CRUD (create/rename/reorder/
  delete) has moved to /kanban/stages (frontend/pages/kanban/stages.vue);
  this page only reads stages to render the board's columns.

  User feedback round 2: drag-and-drop now uses vue-draggable-plus
  (Sortable.js) instead of the browser-standard HTML5 Drag and Drop API,
  for lift/cursor-follow/sibling-reflow animation the native API can't
  give without heavy custom work (design.md Technology Stack already
  allowed this library swap if UX warranted it). Each stage column's card
  list and UnassignedBacklogPanel's expanded list are separate
  `VueDraggable` instances sharing one Sortable `group` ("kanban-cards"),
  so a card can be dragged between any of them. Since none of these lists
  have a persisted "position within a stage" field, `columnTasksByStageId`
  (Sortable's live-mutable view) is force-resynced from the real
  `tasksForStage`/`backlogTasks` computeds immediately on every drag end —
  this both undoes any Sortable-only in-list reordering (we don't
  persist that) and reverts the drop visually until (if) the actual move
  is confirmed (e.g. after the assignee-picker dialog).

  Judgment call carried over from the pre-redesign version
  (requirements.md/design.md are silent on this): a task never has a
  development stage until someone sets one, and Requirement 3's stage
  board excludes stage-less tasks from the per-stage columns — those are
  surfaced instead via UnassignedBacklogPanel (Requirement 3), which is
  also this page's drag SOURCE for stage-less tasks. Its `put: false`
  Sortable group setting enforces "not itself a valid drop target"
  declaratively.
-->
<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import {
  computeBacklogTasks,
  computeFocusedTasks,
  computeTaskProgressById,
  computeTasksForStage,
  computeWorkloadCounts,
} from "./index.helpers";

const api = useApiClient();
const stages = ref<DevelopmentStage[]>([]);

const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const pendingMove = ref<{ taskId: string; targetStageId: string } | null>(null);
const pendingAssigneeUserId = ref("");

// Task 4.1, design.md "kanban/index.vue" State Management: the single
// assignee-filter selection driving both the担当者フォーカス表示
// (Requirement 1) and the開発段階別ボードの絞り込み (Requirement 4).
// "" = "すべて" (AssigneeFilter.vue's convention).
const selectedAssigneeUserId = ref("");

// Requirement 1.2/1.3: selected assignee's incomplete tasks, any/no stage.
const focusedTasks = computed(() => computeFocusedTasks(tasks.value, selectedAssigneeUserId.value));
// Requirement 2.1-2.3: per-assignee counts, always all assignees (not
// filtered by selectedAssigneeUserId per design.md).
const workloadCounts = computed(() => computeWorkloadCounts(tasks.value, users.value));
// Requirement 3.1/3.6: tasks with no development stage set.
const backlogTasks = computed(() => computeBacklogTasks(tasks.value));
// Requirement 5.4/5.5: completed/total child counts per parent task id.
const taskProgressById = computed(() => computeTaskProgressById(tasks.value));

// Sortable-mutable per-stage mirror of tasksForStage(stage.id) — see header
// comment. Keyed by stage id, resynced whenever the underlying data changes.
const columnTasksByStageId = reactive<Record<string, Task[]>>({});

function syncColumnTasks() {
  const nextIds = new Set(stages.value.map((s) => s.id));
  for (const key of Object.keys(columnTasksByStageId)) {
    if (!nextIds.has(key)) delete columnTasksByStageId[key];
  }
  for (const stage of stages.value) {
    columnTasksByStageId[stage.id] = computeTasksForStage(tasks.value, stage.id, selectedAssigneeUserId.value);
  }
}

watch([tasks, stages, selectedAssigneeUserId], syncColumnTasks, { immediate: true });

async function loadStages() {
  stages.value = await api.listDevelopmentStages();
}

async function loadTasks() {
  tasks.value = await api.listTasks();
}

function userName(userId: string | null | undefined): string | undefined {
  return users.value.find((u) => u.id === userId)?.name;
}

async function onDropOnStage(targetStageId: string, taskId: string) {
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

// Shared `end` handler for every stage column's VueDraggable. Always
// resyncs immediately (see header comment), then runs the move logic if
// the card actually landed in a (different) stage column.
async function handleColumnDragEnd(evt: DraggableEvent) {
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  const targetStageId = (evt.to as HTMLElement | undefined)?.dataset.stageId;
  // Defer to the next tick — see UnassignedBacklogPanel.vue's handleListEnd
  // for why resyncing synchronously inside Sortable's own onEnd callback
  // corrupts Sortable's state for the next drag on the same list.
  await nextTick();
  syncColumnTasks();
  if (taskId && targetStageId) {
    await onDropOnStage(targetStageId, taskId);
  }
}

// UnassignedBacklogPanel resyncs its own local list internally; it only
// bubbles up the move outcome for us to act on.
async function handleBacklogDragEnd(payload: { taskId: string; targetStageId?: string }) {
  if (payload.targetStageId) {
    await onDropOnStage(payload.targetStageId, payload.taskId);
  }
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
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">カンバン</h1>
      <NuxtLink
        to="/kanban/stages"
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

    <TeamWorkloadSummary v-model="selectedAssigneeUserId" :counts="workloadCounts" />

    <AssigneeFocusTray v-if="selectedAssigneeUserId" :tasks="focusedTasks" :users="users" />

    <p v-if="stages.length === 0" class="text-sm text-slate-600">
      開発段階が未登録です。「開発段階の管理」から登録してください。
    </p>

    <div v-if="pendingMove" class="assignee-picker space-y-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200" role="dialog">
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

    <div class="board flex items-start gap-4 overflow-x-auto pb-2">
      <UnassignedBacklogPanel :tasks="backlogTasks" :users="users" @end="handleBacklogDragEnd" />

      <div
        v-for="stage in stages"
        :key="stage.id"
        class="column w-72 shrink-0 rounded-lg border border-slate-200 bg-slate-100 p-3"
        :data-stage-id="stage.id"
      >
        <div class="mb-3 flex items-center gap-2 px-1">
          <h3 class="text-sm font-semibold text-slate-700">{{ stage.name }}</h3>
          <span class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">{{
            (columnTasksByStageId[stage.id] ?? []).length
          }}</span>
        </div>
        <VueDraggable
          :model-value="columnTasksByStageId[stage.id] ?? []"
          @update:model-value="(val: Task[]) => (columnTasksByStageId[stage.id] = val)"
          :group="{ name: 'kanban-cards', pull: true, put: true }"
          :animation="200"
          :force-fallback="true"
          :fallback-on-body="true"
          ghost-class="task-card-ghost"
          chosen-class="task-card-chosen"
          drag-class="task-card-dragging"
          class="card-list min-h-12 max-h-[36rem] space-y-2 overflow-y-auto"
          :data-stage-id="stage.id"
          @end="handleColumnDragEnd"
        >
          <TaskCard
            v-for="task in columnTasksByStageId[stage.id] ?? []"
            :key="task.id"
            :task="task"
            :assignee-name="userName(task.assigneeUserId)"
            :progress="taskProgressById.get(task.id)"
          />
        </VueDraggable>
      </div>
    </div>
  </div>
</template>
