<!--
  Recursive task-hierarchy node (task 11.1, design.md "Frontend/tasks",
  Requirements 1.1-1.5, 2.1-2.2). Renders one task plus its children
  (collapsible), status/priority at a glance, and a split action.

  task-status-model 5.2: StageBadge after priority; hide status/select/split
  on terminal stages; title+badges / spacer / actions layout locks actions right.
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { DevelopmentStage, Task, TaskStatus } from "../../composables/useApiClient";
import { isTaskClosed } from "../../composables/useTaskClosure";
import PriorityBadge from "../shared/PriorityBadge.vue";
import StageBadge from "../shared/StageBadge.vue";
import StatusBadge from "../shared/StatusBadge.vue";

const props = defineProps<{
  task: Task;
  children: Task[];
  allTasks: Task[];
  stages: DevelopmentStage[];
}>();

const emit = defineEmits<{
  statusChange: [id: string, status: TaskStatus];
  split: [task: Task];
}>();

const expanded = ref(true);

const stage = computed(() => {
  const stageId = props.task.developmentStageId;
  if (stageId == null) return null;
  return props.stages.find((entry) => entry.id === stageId) ?? null;
});

const closed = computed(() => isTaskClosed(props.task, props.stages));

function childrenOf(taskId: string): Task[] {
  return props.allTasks.filter((t) => t.parentTaskId === taskId);
}
</script>

<template>
  <li :data-task-id="task.id" :data-status="task.status" :data-priority="task.priority" class="py-1">
    <div data-testid="task-node-main" class="flex items-center gap-2">
      <div data-testid="task-node-badges" class="flex min-w-0 flex-wrap items-center gap-2">
        <button
          v-if="children.length > 0"
          type="button"
          class="w-4 text-slate-400 hover:text-slate-600"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? "▾" : "▸" }}
        </button>
        <span v-else class="w-4"></span>
        <span class="text-sm font-medium text-slate-900">{{ task.title }}</span>
        <PriorityBadge :priority="task.priority" />
        <StageBadge :kind="stage?.kind ?? null" :name="stage?.name ?? null" prefix-mode="list" />
        <StatusBadge v-if="!closed" :status="task.status" />
      </div>
      <div data-testid="task-node-spacer" class="min-w-2 flex-1" aria-hidden="true"></div>
      <div data-testid="task-node-actions" class="flex shrink-0 items-center gap-2">
        <select
          v-if="!closed"
          :value="task.status"
          class="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          @change="emit('statusChange', task.id, ($event.target as HTMLSelectElement).value as TaskStatus)"
        >
          <option value="not_started">未着手</option>
          <option value="in_progress">作業中</option>
          <option value="ready_for_handoff">引継待ち</option>
          <option value="on_hold">保留</option>
        </select>
        <button
          v-if="!closed"
          type="button"
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          @click="emit('split', task)"
        >
          分割
        </button>
      </div>
    </div>

    <ul v-if="expanded && children.length > 0" class="list-none pl-6">
      <TaskNode
        v-for="child in children"
        :key="child.id"
        :task="child"
        :children="childrenOf(child.id)"
        :all-tasks="allTasks"
        :stages="stages"
        @status-change="(id, status) => emit('statusChange', id, status)"
        @split="(t) => emit('split', t)"
      />
    </ul>
  </li>
</template>
