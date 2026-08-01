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
    reordering).
  - User feedback round 2 ("各カンバンは5件程度を目安に...縦スクロール"):
    the expanded card list scrolls internally (`max-h-*` + overflow-y-auto)
    rather than growing the page, matching the stage columns' treatment.
  - User feedback round 3 (cancel-leaves-a-duplicate-card bug): resyncing
    `draggableTasks` synchronously/immediately on every drag end fought
    Sortable's own internal bookkeeping and its drop animation, producing
    a stale duplicate DOM node until reload. Fixed by NOT resyncing
    eagerly at all here — a successful move flows back through `props.tasks`
    naturally (parent reloads, this component's own `watch(visibleTasks)`
    picks it up). Only an aborted move (assignee-picker canceled) needs an
    explicit revert, which the parent triggers via the exposed `resync()`
    method — by the time a user clicks "cancel", Sortable's own drag
    transition has long finished, so there's no timing race.
  - User feedback round 3: collapse/expand now animates (width transition
    on a single root element, swapping only the inner content) instead of
    an abrupt swap between two different elements; the toggle icon is a
    left/right chevron (this panel now collapses to a narrow side strip,
    not a horizontal accordion) instead of the up/down chevron left over
    from the earlier full-width layout.
  - Round 3 follow-up ("開くときに中のカードが有効化されてからでてくるので、
    一瞬縦のスクロールバーが表示されます"): rendering the card list
    immediately when `expanded` flips true meant it laid out (and wrapped
    titles, growing taller) while the panel was still narrow mid-transition,
    flashing a vertical scrollbar for the ~300ms until the width settled.
    Content now stays hidden until the width transition's `transitionend`
    fires (`contentVisible`), so it only appears once the panel is already
    at full width. Collapsing hides content immediately — no flash there,
    since it can only ever get narrower.
  - Impeccable third critique: this was the only lane on the board without
    a heading landmark — every stage column and the focus tray has an
    `<h2>`, but this panel's label was plain text inside its toggle
    `<button>`, invisible to heading-based screen-reader navigation (a
    standard technique independent of the column-jump skip links). The
    label is now a real `<h2>` (nesting a heading inside a button is valid
    HTML and keeps the toggle's click/keyboard behavior unchanged) —
    fitting, since this is this project's own documented largest lane
    (~50 items), not a minor one. The same empty-state contrast fix
    applied to `AssigneeFocusTray.vue` last round (`text-slate-500` →
    `text-slate-600`, 4.34:1 → 6.92:1) is applied here too, at line ~190 —
    the identical pattern was missed here because the prior round's live
    testing never hit "expanded and empty" for this specific panel.
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
const emit = defineEmits<{ end: [payload: { taskId: string; targetStageId?: string }]; "card-activate": [taskId: string] }>();

// Requirement 3.1/3.2: collapsed by default, no rendering of cards until
// the user explicitly expands.
const expanded = ref(false);
// Gated separately from `expanded` — see header comment. True only once the
// expand width-transition has finished; false immediately on collapse.
const contentVisible = ref(false);
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

// Sortable-mutable mirror of visibleTasks — see header comment on resync
// strategy. Only re-derived when the real data changes; never forced on
// drag end.
const draggableTasks = ref<Task[]>([]);
watch(visibleTasks, (next) => (draggableTasks.value = [...next]), { immediate: true });

function toggleExpanded() {
  if (expanded.value) {
    expanded.value = false;
    contentVisible.value = false;
  } else {
    expanded.value = true;
    // contentVisible flips true in handleTransitionEnd once the width
    // transition actually finishes.
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

// Called by the parent when a move that pulled a card out of this panel
// gets canceled (assignee-picker dismissed) — reverts Sortable's
// optimistic removal.
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
      <!-- Left/right chevron matches this panel's side-strip collapse
           direction (round 3 fix — was an up/down chevron left over from
           the earlier full-width horizontal layout). -->
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
          :assignee-name="assigneeNameFor(task)"
          @activate="emit('card-activate', task.id)"
        />
      </VueDraggable>
    </div>
  </div>
</template>
