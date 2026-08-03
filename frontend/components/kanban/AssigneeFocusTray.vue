<!--
  Assignee focus tray (task 2.1, design.md "AssigneeFocusTray" component
  detail block, Requirement 1.2/1.3/1.4/1.5). Shown by the parent kanban page
  only while a specific assignee is selected (Requirement 1.1 — that
  render-or-not decision belongs to the parent page, out of scope here).

  - Requirement 1.2/1.3: `tasks` is expected to already be filtered by the
    caller to the selected assignee's incomplete tasks, regardless of
    whether a development stage is set — this component only renders them.
  - Requirement 1.4: the display area has a fixed height; once the task list
    overflows it, only internal scrolling (not page scrolling) reveals the
    rest.
  - Requirement 1.5: an empty `tasks` list shows a zero-count message
    instead of an empty area.

  This tray is a drop TARGET (not just inert) — dragging an unassigned
  card here assigns it to the currently-focused user. It's a
  `VueDraggable` with `put: true`, sharing the same `kanban-cards` Sortable
  group as the stage columns and backlog panel. This component only
  reports which task was dropped (`assign` event); the parent owns the
  actual API call, since it alone knows the currently selected assignee
  and needs to also revert the optimistic drop (backend constraint:
  `updateDevelopmentStage` only ever sets `assigneeUserId` when the task
  doesn't already have one — reassigning an already-assigned task is a
  no-op there, see `research.md`/parent component) — the parent calls the
  exposed `resync()` after handling the drop either way. Has a
  background/border like the other lanes, since it functions as one.

  Also `pull: true`: a card dropped here only gets an assignee, not a
  development stage, so without this it would sit effectively hidden back
  in the (possibly collapsed) backlog panel until the user went and found
  it again. Instead the card sits right here, visibly, and can be dragged
  straight from the tray into a stage column next, so the two-step
  "assign, then place" flow stays in one visible spot. Dragging out emits
  `end` (same shape as UnassignedBacklogPanel's) for the parent to act on.
-->
<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import { isEmpty, resolveAssigneeName } from "./AssigneeFocusTray.helpers";

interface AssigneeFocusTrayProps {
  tasks: Task[];
  users: User[];
}

const props = defineProps<AssigneeFocusTrayProps>();
const emit = defineEmits<{
  assign: [taskId: string];
  end: [payload: { taskId: string; targetStageId?: string }];
  "card-activate": [taskId: string];
}>();

const hasNoTasks = computed(() => isEmpty(props.tasks));

// Sortable-mutable mirror of props.tasks — same resync strategy as
// UnassignedBacklogPanel.vue (no eager resync on drop; only on explicit
// parent request via the exposed `resync()`).
const draggableTasks = ref<Task[]>([]);
watch(
  () => props.tasks,
  (next) => (draggableTasks.value = [...next]),
  { immediate: true },
);

function assigneeNameFor(task: Task): string | undefined {
  return resolveAssigneeName(props.users, task.assigneeUserId);
}

function handleAdd(evt: DraggableEvent) {
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  if (taskId) emit("assign", taskId);
}

// Fires when a drag STARTS in this tray, regardless of where it lands
// (Sortable's onEnd is a source-side event — see UnassignedBacklogPanel's
// identically-shaped handleListEnd). Always emit when there's a `taskId`
// (matching UnassignedBacklogPanel's condition) even if `targetStageId` is
// undefined — a drop back into this tray itself is exactly that case, and
// the parent still needs to hear about it to clear its drop-target
// highlight. Emitting only when `targetStageId` is set would mean a
// "changed my mind, dropped back in the tray" drag never notifies the
// parent, leaving whichever column had last been hovered stuck highlighted.
function handleEnd(evt: DraggableEvent) {
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  const targetStageId = (evt.to as HTMLElement | undefined)?.dataset.stageId;
  if (taskId) emit("end", { taskId, targetStageId });
}

function resync() {
  draggableTasks.value = [...props.tasks];
}

defineExpose({ resync });
</script>

<template>
  <section class="focus-tray rounded-lg border border-slate-200 bg-slate-100 p-3">
    <h2 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600" tabindex="-1">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      担当者フォーカス
    </h2>
    <p v-if="hasNoTasks" class="empty-state text-sm text-slate-600">未完了タスクは0件です</p>
    <VueDraggable
      v-model="draggableTasks"
      :group="{ name: 'kanban-cards', pull: true, put: true }"
      :sort="false"
      :animation="200"
      :force-fallback="true"
      :fallback-on-body="true"
      ghost-class="task-card-ghost"
      chosen-class="task-card-chosen"
      fallback-class="task-card-drag-clone"
      :on-move="preventSameListMove"
      class="min-h-12 max-h-80 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 overflow-y-auto"
      @add="handleAdd"
      @end="handleEnd"
    >
      <TaskCard
        v-for="task in draggableTasks"
        :key="task.id"
        :task="task"
        :assignee-name="assigneeNameFor(task)"
        @activate="emit('card-activate', task.id)"
      />
    </VueDraggable>
  </section>
</template>
