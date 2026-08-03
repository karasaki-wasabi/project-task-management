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

  Visual layout: title top-left + priority badge top-right on the same row;
  status text + optional progress bar bottom-left, assignee initial
  bottom-right.

  Drag is not the only way to move or reassign a task: the card is
  focusable and emits `activate` on Enter/Space/click (a plain click — no
  drag movement — is safe alongside Sortable, which only starts a drag past
  a movement threshold); every caller (kanban/index.vue directly, or
  bubbled up through AssigneeFocusTray/UnassignedBacklogPanel) opens a
  keyboard-operable action menu offering the same stage-move /
  assign-on-move mutations dragging already performs. This keeps the
  primary workflow reachable without a mouse.

  Title is `line-clamp-2` with a `title` attribute carrying the full text:
  an unclamped title could wrap indefinitely and distort card height/grid
  rhythm across a column.

  A small "⋯" hint fades in on hover/focus (`group-hover`/
  `group-focus-visible`) to signal that clicking opens an action menu,
  since `cursor-grab` alone only hints at dragging. It is decorative only
  (`aria-hidden`, `pointer-events-none`) — the whole card stays the actual
  click/keyboard target via the existing aria-label.
-->
<script setup lang="ts">
import { formatProgress, shouldShowProgress, type TaskProgress } from "./TaskCard.helpers";

interface TaskCardProps {
  task: Task;
  assigneeName?: string;
  progress?: TaskProgress;
}

const props = defineProps<TaskCardProps>();
const emit = defineEmits<{ activate: [] }>();

const showProgress = computed(() => shouldShowProgress(props.progress));
const progressLabel = computed(() => (props.progress ? formatProgress(props.progress) : ""));
const progressPercent = computed(() => (props.progress ? Math.round((props.progress.completed / props.progress.total) * 100) : 0));
const assigneeInitial = computed(() => props.assigneeName?.charAt(0) ?? "");
</script>

<template>
  <div
    class="card group cursor-grab select-none rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:cursor-grabbing"
    :data-task-id="task.id"
    role="button"
    tabindex="0"
    :aria-label="`${task.title}、操作メニューを開く`"
    @click="emit('activate')"
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
      <span class="mt-1 block text-[11px] text-slate-500">{{ progressLabel }}</span>
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
