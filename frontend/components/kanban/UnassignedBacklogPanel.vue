<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import { filterTasksByTitle, sortTasks, type BacklogSortKey } from "./UnassignedBacklogPanel.helpers";
import { resolveAssigneeName } from "./AssigneeFocusTray.helpers";

interface UnassignedBacklogPanelProps {
  tasks: Task[];
  users: User[];
}

const props = defineProps<UnassignedBacklogPanelProps>();
const emit = defineEmits<{ end: [payload: { taskId: string; targetStageId?: string }]; "card-activate": [taskId: string] }>();

const expanded = ref(false);
const contentVisible = ref(false);
const searchQuery = ref("");
const sortKey = ref<BacklogSortKey>("priority");

const count = computed(() => props.tasks.length);

const visibleTasks = computed(() => {
  const filtered = filterTasksByTitle(props.tasks, searchQuery.value);
  return sortTasks(filtered, sortKey.value);
});

const draggableTasks = ref<Task[]>([]);
watch(visibleTasks, (next) => (draggableTasks.value = [...next]), { immediate: true });

function toggleExpanded() {
  if (expanded.value) {
    expanded.value = false;
    contentVisible.value = false;
  } else {
    expanded.value = true;
  }
}

function handleTransitionEnd(evt: TransitionEvent) {
  if (evt.propertyName === "width" && expanded.value) contentVisible.value = true;
}

function assigneeNameFor(task: Task): string | undefined {
  return resolveAssigneeName(props.users, task.assigneeUserId);
}

function handleListEnd(evt: DraggableEvent) {
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  const targetStageId = (evt.to as HTMLElement | undefined)?.dataset.stageId;
  if (taskId) emit("end", { taskId, targetStageId });
}

function resync() {
  draggableTasks.value = [...visibleTasks.value];
}

defineExpose({ resync });
</script>

<template>
  <div
    class="backlog-panel flex shrink-0 flex-col overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-100 transition-[width] duration-300 ease-in-out"
    :class="expanded ? 'w-72' : 'w-14'"
    @transitionend="handleTransitionEnd"
  >
    <button
      type="button"
      class="backlog-toggle flex shrink-0 items-center gap-2 hover:bg-slate-200/60"
      :class="expanded ? 'justify-between px-2 py-2' : 'flex-col justify-center gap-3 py-4'"
      :aria-label="`未割り当て ${count}件 ${expanded ? '折りたたむ' : '展開'}`"
      @click="toggleExpanded"
    >
      <span class="flex items-center gap-2 text-sm font-semibold text-slate-700" :class="{ 'flex-col': !expanded }">
        <svg class="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        </svg>
        <h2 v-if="expanded" class="m-0 text-sm font-semibold text-slate-700">未割り当て</h2>
        <h2 v-else class="m-0 text-xs font-medium text-slate-600" style="writing-mode: vertical-rl">未割り当て</h2>
        <span
          class="backlog-count shrink-0 rounded-full bg-white text-slate-500 ring-1 ring-slate-200"
          :class="expanded ? 'px-2 py-0.5 text-xs font-semibold' : 'px-1.5 py-0.5 text-[11px] font-semibold'"
          >{{ count }}件</span
        >
      </span>
      <svg
        class="h-4 w-4 shrink-0 text-slate-400 transition-transform"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path v-if="expanded" d="M15 6l-6 6 6 6" />
        <path v-else d="M9 6l6 6-6 6" />
      </svg>
    </button>

    <div v-if="contentVisible" class="backlog-expanded flex min-h-0 flex-1 flex-col gap-2 p-3 pt-0">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="タイトルで検索"
        class="backlog-search w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <select
        v-model="sortKey"
        class="backlog-sort w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <option value="priority">優先度順</option>
        <option value="createdAt">作成日時順</option>
      </select>

      <p v-if="visibleTasks.length === 0" class="empty-state text-sm text-slate-600">0件です</p>
      <VueDraggable
        v-else
        v-model="draggableTasks"
        :group="{ name: 'kanban-cards', pull: true, put: false }"
        :sort="false"
        :animation="200"
        :force-fallback="true"
        :fallback-on-body="true"
        ghost-class="task-card-ghost"
        chosen-class="task-card-chosen"
        fallback-class="task-card-drag-clone"
        :on-move="preventSameListMove"
        class="card-list max-h-[36rem] space-y-2 overflow-y-auto"
        @end="handleListEnd"
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
    </div>
  </div>
</template>
