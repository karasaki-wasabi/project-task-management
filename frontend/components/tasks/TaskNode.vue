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
  <li :data-task-id="task.id" :data-status="task.status">
    <div class="task-row">
      <button
        v-if="children.length > 0"
        type="button"
        class="toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? "▾" : "▸" }}
      </button>
      <span class="title">{{ task.title }}</span>
      <span class="priority" :data-priority="task.priority">優先度: {{ task.priority }}</span>
      <select
        :value="task.status"
        @change="emit('statusChange', task.id, ($event.target as HTMLSelectElement).value as TaskStatus)"
      >
        <option value="not_started">未着手</option>
        <option value="in_progress">進行中</option>
        <option value="done">完了</option>
        <option value="on_hold">保留</option>
      </select>
      <button type="button" @click="emit('split', task)">分割</button>
    </div>

    <ul v-if="expanded && children.length > 0">
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

<style scoped>
.task-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.toggle {
  cursor: pointer;
}
</style>
