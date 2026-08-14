<!--
  Task card (task-status-model 5.5, design.md "Frontend/kanban" → TaskCard,
  Requirements 4.5, 8.6, 8.9; also carries prior kanban-ux Requirements 5/6.1).
  Shared between the stage board, AssigneeFocusTray, and the expanded
  UnassignedBacklogPanel list so status/priority/progress display rules stay
  centralized in one place (design.md Implementation Notes).

  - Requirement 4.5: terminal columns omit the status badge; the footer row
    stays so the assignee avatar remains bottom-right and aligned with
    normal columns.
  - Requirement 8.6/8.9: progress uses completed-stage / non-cancelled
    children; when cancelled children were excluded, annotate 「中止 N 件を除く」.
    Terminal columns and mother-0 (total === 0) hide progress entirely.
  - Requirement 6.1 (prior): the root element keeps the `class="card"` /
    `data-task-id` DOM contract used by E2E selectors. Actual drag
    mechanics are owned by vue-draggable-plus (Sortable.js) at the list
    level rather than this component.

  Visual layout: title top-left + priority badge top-right on the same row;
  optional progress; status (optional) + UserAvatar bottom-right.

  Clicking (or Enter/Space when focused) opens the task detail/edit/delete
  popup — the card just emits `activate`. Pointer down/up (not native
  `click`) avoids Sortable's intermittent click suppression after a
  wiggle-then-release gesture.
-->
<script setup lang="ts">
import { computed } from "vue";
import {
  formatExcludedCancelledNote,
  formatProgress,
  shouldShowProgress,
  shouldShowStatus,
  type TaskProgress,
} from "./TaskCard.helpers";

interface TaskCardProps {
  task: Task;
  assigneeId?: string;
  assigneeName?: string;
  progress?: TaskProgress;
  /** True when the card is rendered inside a completed/cancelled stage column. */
  isTerminalColumn?: boolean;
}

const props = withDefaults(defineProps<TaskCardProps>(), {
  isTerminalColumn: false,
});
const emit = defineEmits<{ activate: [] }>();

const displayOptions = computed(() => ({ isTerminalColumn: props.isTerminalColumn }));
const showProgress = computed(() => shouldShowProgress(props.progress, displayOptions.value));
const showStatus = computed(() => shouldShowStatus(displayOptions.value));
const progressLabel = computed(() => (props.progress ? formatProgress(props.progress) : ""));
const progressPercent = computed(() =>
  props.progress && props.progress.total > 0
    ? Math.round((props.progress.completed / props.progress.total) * 100)
    : 0,
);
const excludedNote = computed(() =>
  props.progress ? formatExcludedCancelledNote(props.progress.excludedCancelled) : null,
);

const clickMoveThreshold = 6;
let pointerDownPos: { x: number; y: number } | null = null;

function onPointerDown(event: PointerEvent) {
  pointerDownPos = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event: PointerEvent) {
  const start = pointerDownPos;
  pointerDownPos = null;
  if (!start) return;
  const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (distance <= clickMoveThreshold) emit("activate");
}
</script>

<template>
  <div
    class="card group cursor-grab select-none rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:cursor-grabbing"
    :data-task-id="task.id"
    role="button"
    tabindex="0"
    :aria-label="`${task.title}、詳細を開く`"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @keydown.enter.prevent="emit('activate')"
    @keydown.space.prevent="emit('activate')"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="task-title line-clamp-2 font-medium leading-snug text-slate-900" :title="task.title">{{
        task.title
      }}</span>
      <span class="flex shrink-0 items-center gap-1">
        <PriorityBadge :priority="task.priority" />
        <span
          class="pointer-events-none leading-none text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        >
          ⋯
        </span>
      </span>
    </div>

    <div v-if="showProgress" class="mt-2">
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div class="task-progress h-full rounded-full bg-primary-600" :style="{ width: `${progressPercent}%` }" />
      </div>
      <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-500">
        <span>{{ progressLabel }}</span>
        <span v-if="excludedNote" class="text-slate-400">{{ excludedNote }}</span>
      </div>
    </div>

    <div data-testid="task-card-footer" class="mt-2 flex items-center justify-between gap-2">
      <StatusBadge v-if="showStatus" :status="task.status" />
      <UserAvatar
        v-if="assigneeId && assigneeName"
        class="ml-auto shrink-0"
        :userId="assigneeId"
        :name="assigneeName"
        :size="24"
      />
    </div>
  </div>
</template>
