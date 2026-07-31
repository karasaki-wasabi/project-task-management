<!--
  Recursive task-hierarchy node (task 11.1, design.md "Frontend/tasks",
  Requirements 1.1-1.5, 2.1-2.2). Renders one task plus its children
  (collapsible), status/priority at a glance, and a split action.
-->
<script setup lang="ts">
const props = defineProps<{
  task: Task;
  children: Task[];
  allTasks: Task[];
}>();

const emit = defineEmits<{
  statusChange: [id: string, status: TaskStatus];
  split: [task: Task];
}>();

const expanded = ref(true);

function childrenOf(taskId: string): Task[] {
  return props.allTasks.filter((t) => t.parentTaskId === taskId);
}
</script>

<template>
  <li :data-task-id="task.id" :data-status="task.status" :data-priority="task.priority" class="py-1">
    <div class="flex flex-wrap items-center gap-2">
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
      <StatusBadge :status="task.status" />
      <select
        :value="task.status"
        class="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        @change="emit('statusChange', task.id, ($event.target as HTMLSelectElement).value as TaskStatus)"
      >
        <option value="not_started">未着手</option>
        <option value="in_progress">進行中</option>
        <option value="done">完了</option>
        <option value="on_hold">保留</option>
      </select>
      <button
        type="button"
        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        @click="emit('split', task)"
      >
        分割
      </button>
    </div>

    <ul v-if="expanded && children.length > 0" class="list-none pl-6">
      <TaskNode
        v-for="child in children"
        :key="child.id"
        :task="child"
        :children="childrenOf(child.id)"
        :all-tasks="allTasks"
        @status-change="(id, status) => emit('statusChange', id, status)"
        @split="(t) => emit('split', t)"
      />
    </ul>
  </li>
</template>
