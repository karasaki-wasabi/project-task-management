<!--
  Unassigned backlog panel (task 2.3, design.md "UnassignedBacklogPanel"
  component detail block, Requirement 3.1-3.6). Shown by the parent kanban
  page for tasks whose developmentStageId is unset (design.md: "呼び出し側が
  developmentStageId が未設定のタスクに絞り込み済み" — this component does
  not itself filter by stage, it only receives the already-filtered list).

  Repositioned (user feedback round 2: "カンバン定義の左端に折りたたみ可能な
  未割り当てがあるとよいです") from a full-width panel above the board into
  the leftmost column of the board's own horizontally-scrolling row, so
  dragging a backlog task into a stage column is a short reach rather than
  a trip across the whole page. Collapsed state is now a narrow vertical
  strip (same column height family as stage columns) instead of a
  full-width bar.

  - Requirement 3.1/3.2: while collapsed (`expanded === false`, the default),
    only a count badge renders — no card/row for any task is drawn.
  - Requirement 3.3/3.4/3.5: expanding switches to a searchable/sortable
    list. Search and sort decision logic is pure and unit-tested in
    ./UnassignedBacklogPanel.helpers.ts (this repo has no @vue/test-utils /
    DOM test environment, see frontend/vitest.config.ts).
  - Requirement 3.6: an empty `tasks` prop shows "0件" as the badge count,
    both collapsed and expanded.
  - "開発段階未設定タスクのドラッグ継続" (System Flows), now via
    vue-draggable-plus (Sortable.js): the expanded list is itself a
    `VueDraggable` sharing the `kanban-cards` group with the stage
    columns, with `put: false` (Requirement 3's rule that this panel is a
    drag SOURCE only, never a valid drop target, is now enforced
    declaratively by Sortable rather than by convention) and `sort: false`
    (order here is controlled by the sort `<select>`, not manual drag
    reordering). `draggableTasks` is a local mutable mirror of
    `visibleTasks` that Sortable is allowed to touch during a drag; it is
    forcibly resynced to `visibleTasks` immediately in `handleListEnd` so
    a card that left (or an aborted drag) always reflects real state,
    then an `end` event bubbles the raw `{taskId, targetStageId}` up so
    the parent can run the actual move/assignee-picker business logic.
  - User feedback round 2 ("各カンバンは5件程度を目安に...縦スクロール"):
    the expanded card list scrolls internally (`max-h-*` + overflow-y-auto)
    rather than growing the page, matching the stage columns' treatment.
-->
<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import { filterTasksByTitle, sortTasks, type BacklogSortKey } from "./UnassignedBacklogPanel.helpers";
import { resolveAssigneeName } from "./AssigneeFocusTray.helpers";

interface UnassignedBacklogPanelProps {
  tasks: Task[];
  users: User[];
}

const props = defineProps<UnassignedBacklogPanelProps>();
const emit = defineEmits<{ end: [payload: { taskId: string; targetStageId?: string }] }>();

// Requirement 3.1/3.2: collapsed by default, no rendering of cards until
// the user explicitly expands.
const expanded = ref(false);
const searchQuery = ref("");
const sortKey = ref<BacklogSortKey>("priority");

// Requirement 3.6: 0 when there are no unassigned tasks at all. This counts
// the full `tasks` prop (not the filtered/sorted view), since the badge
// reflects "how many unassigned tasks exist", independent of the in-progress
// search text.
const count = computed(() => props.tasks.length);

const visibleTasks = computed(() => {
  const filtered = filterTasksByTitle(props.tasks, searchQuery.value);
  return sortTasks(filtered, sortKey.value);
});

// Sortable-mutable mirror of visibleTasks — see header comment.
const draggableTasks = ref<Task[]>([]);
watch(visibleTasks, (next) => (draggableTasks.value = [...next]), { immediate: true });

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function assigneeNameFor(task: Task): string | undefined {
  return resolveAssigneeName(props.users, task.assigneeUserId);
}

async function handleListEnd(evt: DraggableEvent) {
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  const targetStageId = (evt.to as HTMLElement | undefined)?.dataset.stageId;
  // Defer the resync to the next tick: overwriting the v-model array
  // synchronously inside Sortable's own `onEnd` callback (before it
  // finishes its internal bookkeeping for this drag) was found to corrupt
  // Sortable's state for the *next* drag on this same list — a second
  // card dragged out of the backlog would silently fail to move. Letting
  // Sortable's own onEnd handling complete first avoids that.
  await nextTick();
  draggableTasks.value = [...visibleTasks.value];
  if (taskId) emit("end", { taskId, targetStageId });
}
</script>

<template>
  <!-- Collapsed: narrow vertical strip, same column family as stage columns. -->
  <button
    v-if="!expanded"
    type="button"
    class="backlog-panel backlog-toggle flex w-14 shrink-0 flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-100 py-4 hover:bg-slate-200"
    :aria-label="`未割り当て ${count}件 展開`"
    @click="toggleExpanded"
  >
    <svg class="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    </svg>
    <span class="text-xs font-medium text-slate-500" style="writing-mode: vertical-rl">未割り当て</span>
    <span class="backlog-count rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{{
      count
    }}件</span>
  </button>

  <!-- Expanded: normal column width, same as stage columns. -->
  <section v-else class="backlog-panel flex w-72 shrink-0 flex-col rounded-lg border border-dashed border-slate-300 bg-slate-100 p-3">
    <button
      type="button"
      class="backlog-toggle mb-3 flex items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-slate-200/60"
      :aria-label="`未割り当て ${count}件 折りたたむ`"
      @click="toggleExpanded"
    >
      <span class="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <svg class="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        </svg>
        未割り当て
        <span class="backlog-count rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{{
          count
        }}件</span>
      </span>
      <svg class="h-4 w-4 shrink-0 rotate-180 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <div class="backlog-expanded flex min-h-0 flex-1 flex-col gap-2">
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

      <p v-if="visibleTasks.length === 0" class="empty-state text-sm text-slate-500">0件です</p>
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
        drag-class="task-card-dragging"
        class="card-list max-h-[36rem] space-y-2 overflow-y-auto"
        @end="handleListEnd"
      >
        <TaskCard v-for="task in draggableTasks" :key="task.id" :task="task" :assignee-name="assigneeNameFor(task)" />
      </VueDraggable>
    </div>
  </section>
</template>
