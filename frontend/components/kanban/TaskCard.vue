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

  Clicking (or Enter/Space when focused) opens the task detail/edit/delete
  popup (kanban-ux-redesign Requirement 8) — the card just emits
  `activate`; every caller (kanban/index.vue directly, or bubbled up
  through AssigneeFocusTray/UnassignedBacklogPanel) wires it straight to
  opening that popup. The popup's edit mode is also the keyboard-accessible
  way to move a task between development stages, since dragging itself has
  no keyboard equivalent.

  User-reported bug: clicking the card sometimes did nothing (1-2 times in
  several attempts) right after a slight wiggle-then-release (just enough
  for Sortable to show its ghost, without completing an actual reorder).
  Drag libraries commonly suppress the native `click` that a completed
  drag gesture would otherwise also fire, as a one-shot guard against
  "drag also triggers whatever the click does" — plausible here too, given
  Sortable's fallback mode drives its own synthetic mouse handling rather
  than native HTML5 drag events. This wasn't reliably reproducible under
  scripted automation (scripted mouse sequences didn't trigger the gap;
  the report came from real interaction), so the exact mechanism is not
  fully confirmed. Regardless, depending on the native `click` event here
  is fragile by construction whenever a drag library shares the same
  element: `pointerdown`/`pointerup` instead measure the release distance
  from the press position directly and emit `activate` when it's below
  `clickMoveThreshold`, without relying on whatever `click` handling (or
  suppression) the drag library layers on top. Keyboard activation
  (Enter/Space) is unaffected — it never went through `click` or Sortable
  to begin with.

  Title is `line-clamp-2` with a `title` attribute carrying the full text:
  an unclamped title could wrap indefinitely and distort card height/grid
  rhythm across a column.

  A small "⋯" hint fades in on hover/focus (`group-hover`/
  `group-focus-visible`) to signal that clicking opens the detail popup,
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

// See header comment: replaces `@click` for pointer input, which Sortable
// can intermittently suppress right after any completed sort gesture.
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
