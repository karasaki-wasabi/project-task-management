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
        :assigneeId="task.assigneeUserId ?? undefined"
        :assigneeName="assigneeNameFor(task)"
        @activate="emit('card-activate', task.id)"
      />
    </VueDraggable>
  </section>
</template>
