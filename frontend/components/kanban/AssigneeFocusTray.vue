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
  - Cards here are not drag sources (design.md Non-Goals: dragging out of
    the focus tray is not required) — simply not wrapped in a
    vue-draggable-plus list, so they're inert by construction.
-->
<script setup lang="ts">
import { isEmpty, resolveAssigneeName } from "./AssigneeFocusTray.helpers";

interface AssigneeFocusTrayProps {
  tasks: Task[];
  users: User[];
}

const props = defineProps<AssigneeFocusTrayProps>();

const hasNoTasks = computed(() => isEmpty(props.tasks));

function assigneeNameFor(task: Task): string | undefined {
  return resolveAssigneeName(props.users, task.assigneeUserId);
}
</script>

<template>
  <section class="focus-tray">
    <h2 class="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      担当者フォーカス
    </h2>
    <p v-if="hasNoTasks" class="empty-state text-sm text-slate-500">未完了タスクは0件です</p>
    <div v-else class="max-h-80 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 overflow-y-auto">
      <TaskCard v-for="task in tasks" :key="task.id" :task="task" :assignee-name="assigneeNameFor(task)" />
    </div>
  </section>
</template>
