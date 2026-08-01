<!--
  Task card (task 1, design.md "Frontend/kanban" → TaskCard, Requirement 5,
  6.1). Shared between the stage board, AssigneeFocusTray, and the expanded
  UnassignedBacklogPanel list so status/priority/progress display rules stay
  centralized in one place (design.md Implementation Notes).

  - Requirement 5.1: task.status is always shown, independent of whichever
    column/list the card happens to be rendered in.
  - Requirement 5.2/5.3: priority is shown as a text label only — this
    reuses the existing shared PriorityBadge/StatusBadge pill components
    (frontend/components/shared/), which render a background-colored pill,
    never a colored accent bar.
  - Requirement 5.4/5.5: progress is rendered only when the caller supplies
    it (decision logic lives in ./TaskCard.helpers.ts, unit-tested there
    since this repo has no DOM test environment for mounting .vue SFCs).
  - Requirement 6.1: the root element keeps the `class="card"` /
    `data-task-id` DOM contract used by E2E selectors. Actual drag
    mechanics are now owned by vue-draggable-plus (Sortable.js) at the
    list level (kanban/index.vue, UnassignedBacklogPanel.vue) rather than
    this component's own `draggable`/`dragstart` — Sortable reads
    `data-task-id` off the dragged element itself in its `onEnd` handler,
    so this component no longer needs a `draggable` prop or emit.

  Visual layout (revised to match the approved Google Stitch mockup,
  UI/screen.png): title top-left + priority badge top-right on the same
  row (diagonal balance per UI/DESIGN.md's "Kanban Cards" note, minus its
  rejected colored-accent-bar rule); status text + optional progress bar
  bottom-left, assignee initial bottom-right.
-->
<script setup lang="ts">
import { formatProgress, shouldShowProgress, type TaskProgress } from "./TaskCard.helpers";

interface TaskCardProps {
  task: Task;
  assigneeName?: string;
  progress?: TaskProgress;
}

const props = defineProps<TaskCardProps>();

const showProgress = computed(() => shouldShowProgress(props.progress));
const progressLabel = computed(() => (props.progress ? formatProgress(props.progress) : ""));
const progressPercent = computed(() => (props.progress ? Math.round((props.progress.completed / props.progress.total) * 100) : 0));
const assigneeInitial = computed(() => props.assigneeName?.charAt(0) ?? "");
</script>

<template>
  <div
    class="card cursor-grab select-none rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:shadow-md active:cursor-grabbing"
    :data-task-id="task.id"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="task-title font-medium leading-snug text-slate-900">{{ task.title }}</span>
      <PriorityBadge :priority="task.priority" />
    </div>

    <div v-if="showProgress" class="mt-2">
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div class="task-progress h-full rounded-full bg-primary-600" :style="{ width: `${progressPercent}%` }" />
      </div>
      <span class="mt-1 block text-[11px] text-slate-400">{{ progressLabel }}</span>
    </div>

    <div class="mt-2 flex items-center justify-between gap-2">
      <StatusBadge :status="task.status" />
      <span
        v-if="assigneeName"
        class="assignee flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-semibold text-primary-700"
        :title="assigneeName"
      >
        {{ assigneeInitial }}
      </span>
    </div>
  </div>
</template>
