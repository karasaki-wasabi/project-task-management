<!--
  Kanban board page (task 4.2, design.md "kanban/index.vue" component
  detail block, Requirements 1.1/1.4/1.5, 2.4/2.5, 3.2/3.3, 4.1-4.3,
  6.1/6.2, 7.2). Development stage master CRUD (create/rename/reorder/
  delete) has moved to /kanban/stages (frontend/pages/kanban/stages.vue);
  this page only reads stages to render the board's columns.

  User feedback round 2: drag-and-drop uses vue-draggable-plus (Sortable.js)
  instead of the browser-standard HTML5 Drag and Drop API, for lift/
  cursor-follow/sibling-reflow animation the native API can't give without
  heavy custom work (design.md Technology Stack already allowed this
  library swap if UX warranted it). Each stage column's card list and
  UnassignedBacklogPanel's/AssigneeFocusTray's lists are separate
  `VueDraggable` instances sharing one Sortable `group` ("kanban-cards"),
  so a card can be dragged between any of them.

  User feedback round 3, resync strategy (fixes a bug where canceling the
  assignee-picker left a stale duplicate card until reload): none of
  these lists have a persisted "position" field, so we do NOT eagerly
  force-resync `columnTasksByStageId`/child components' local mirrors on
  every drag end anymore — that fought Sortable's own internal bookkeeping
  and its drop animation. A successful move flows back naturally (API call
  → `loadTasks()` → the `watch(tasks, ...)` below recomputes everything).
  An ABORTED move (assignee-picker canceled) is the only case needing an
  explicit revert, done once in `cancelPendingMove()` — by then Sortable's
  transition has long finished, so there's no timing race.

  Also round 3: board-wide assignee filtering was removed (kept only in
  AssigneeFocusTray) — a chip click now only drives the focus tray, not
  also the stage board, since filtering both was redundant/confusing.
  Dropping a card onto the focus tray assigns it to the focused user
  (`handleFocusTrayAssign`), subject to the backend's existing constraint
  that `updateDevelopmentStage` only sets `assigneeUserId` when the task
  doesn't already have one (task-delivery-management Requirement 12.8) —
  this spec does not change backend behavior, so reassigning an
  already-assigned task via this drop silently no-ops and reverts.

  Judgment call carried over from the pre-redesign version
  (requirements.md/design.md are silent on this): a task never has a
  development stage until someone sets one, and Requirement 3's stage
  board excludes stage-less tasks from the per-stage columns — those are
  surfaced instead via UnassignedBacklogPanel (Requirement 3), which is
  also this page's drag SOURCE for stage-less tasks. Its `put: false`
  Sortable group setting enforces "not itself a valid drop target"
  declaratively.

  Impeccable critique fixes (dual-agent critique, 2026-08-02,
  .impeccable/critique/2026-08-02T10-20-44Z__frontend-pages-kanban-index-vue.md):
  - P0 "silent failure on focus-tray reassignment drop": the backend
    constraint noted above (no-op on an already-assigned task) used to
    revert with zero explanation. `handleFocusTrayAssign` now sets
    `focusTrayError` and the template surfaces it via the shared
    `ErrorAlert` (the same pattern every other page in this app already
    uses for backend errors, per `.kiro/steering/error-handling.md`).
  - P0 "no non-mouse path to any core interaction": every `TaskCard` (in
    the stage board, the focus tray, and the backlog panel) is now
    focusable and emits `activate`/`card-activate`, opening a keyboard-
    operable action menu (`actionMenuTaskId`) that offers the exact same
    stage-move / assign-on-move mutations dragging already performs — no
    new capability, just a second input path to the same two writes.
  - Both dialog-like overlays on this page (the assignee-picker prompt and
    the new action menu) now get real dialog semantics via
    `useDialogFocusTrap` — `aria-modal`, initial focus on open, a Tab trap,
    and focus restored to whatever opened them on close.
  - P1 "board overflows its own standard desktop width, wasting ~500px":
    the board previously inherited `app.vue`'s shared `max-w-6xl` cap even
    though it's the one surface that needs a horizontally-scrolling row
    wider than that. Originally fixed with a `left-1/2 -translate-x-1/2
    w-screen` wrapper scoped to just the board div — since replaced (user
    feedback, see below) by opting this whole page out of the cap via
    `definePageMeta({ fullWidth: true })`.

  Impeccable re-critique fixes (2026-08-02, second pass,
  .impeccable/critique/2026-08-02T10-57-00Z__frontend-pages-kanban-index-vue.md):
  - P2 "no confirmation on a successful move": the very first critique
    named this and only its failure half (the reassignment no-op) got
    fixed. A move — by drag or by the keyboard action menu — used to end
    in total silence. `announceMoveSuccess()` now sets `moveStatusMessage`
    after every successful write, surfaced as a `role="status"
    aria-live="polite"` banner (auto-clears after 2.5s) — this also gives
    screen-reader users an announcement of the outcome they had zero
    signal of before, not just a visual nicety.
  - P1 "keyboard reach scales linearly with board position": reaching
    column N meant Tabbing through every card in every prior column plus
    the whole expanded backlog. Each stage-column heading, the backlog
    toggle, and the focus tray heading now form a `<nav>` "column jump"
    list (visually a `sr-only` skip-link style list, but see design.md's
    restraint on hidden-until-focus chrome — kept genuinely visually
    hidden except on focus, standard skip-link pattern) so a keyboard user
    can jump directly to any lane's first card without walking every
    card before it.

  User-reported bug fix: dragging A→B→back-to-A (changing your mind
  mid-drag) silently moved the card to B regardless of where it was
  released. Root cause was in `preventSameListMove`
  (composables/useSameListMoveGuard.ts), not here — Sortable's `evt.from`
  in `onMove` is fixed at the ORIGINAL source list for the whole drag
  gesture, not "current location," so returning to the origin list looked
  identical to never having left it and got wrongly blocked. `evt.to` on
  the `change`/`end` events used below is unaffected by this (it reflects
  live hit-testing, not stale bookkeeping) and needed no change.

  User feedback: the earlier `w-screen`-based board-only breakout caused a
  faint page-wide horizontal scrollbar whenever the page ALSO had a
  vertical scrollbar (short window, or a tall board) — `100vw` counts the
  vertical scrollbar's own width in most browsers, so it measures wider
  than the actually-visible viewport the instant one appears. It also only
  widened the board, leaving the title/workload-summary/dialogs above it
  still capped at `max-w-6xl`, a width mismatch the user also flagged as
  bad practice (the board straddling outside its own `<main>`/parent
  structurally). Both fixed by opting this entire page out of `app.vue`'s
  shared cap via `definePageMeta({ fullWidth: true })` instead — no
  viewport units anywhere, and every element on the page (not just one
  hand-picked div) now shares the same, single full width.
-->
<script setup lang="ts">
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import {
  computeBacklogTasks,
  computeFocusedTasks,
  computeTaskProgressById,
  computeTasksForStage,
  computeWorkloadCounts,
} from "./index.helpers";

// Opts this page's <main> out of app.vue's shared max-w-6xl cap (see the
// comment there) — the whole page shares one full width now, not just a
// hand-picked div.
definePageMeta({ fullWidth: true });

const api = useApiClient();
const stages = ref<DevelopmentStage[]>([]);

const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const pendingMove = ref<{ taskId: string; targetStageId: string } | null>(null);
const pendingAssigneeUserId = ref("");
const hoveredStageId = ref<string | null>(null);
const focusTrayError = ref<string | null>(null);

const focusTrayRef = ref<{ resync: () => void } | null>(null);
const backlogPanelRef = ref<{ resync: () => void } | null>(null);
const pendingMoveDialogRef = ref<HTMLElement | null>(null);
const actionMenuDialogRef = ref<HTMLElement | null>(null);

// Impeccable fifth critique P0 ("rejected focus-tray reassignment makes the
// source task vanish from its stage column until a hard reload"): the
// obvious fix — re-run `syncColumnTasks()` — turned out not to be enough.
// Root cause, found by logging `columnTasksByStageId` before/after: the
// array was ALREADY correct the whole time (unchanged, since no API call
// ever fires for a rejected move). Sortable's `put: true` group physically
// moves the real DOM node into the tray via direct DOM APIs the instant
// the drop lands — before our business logic ever runs, and entirely
// outside Vue's virtual DOM. Because the reactive array's *content* never
// actually changes, Vue's keyed diff has nothing to react to and leaves
// the (physically relocated) DOM node exactly where Sortable put it — a
// content-based re-sync can't undo a move Vue never knew happened. Forcing
// the affected stage columns to fully remount (a fresh `:key`) is the
// reliable fix: it makes Vue recreate the DOM nodes from the (already
// correct) array instead of assuming nothing changed.
const boardRenderEpoch = ref(0);

async function revertOptimisticMove() {
  // Sortable fires its own events for the SOURCE list (removal) separately
  // from the events we handle on the DESTINATION list (add/assign) — if
  // ours runs first, a still-in-flight source-side `@update:model-value`
  // can arrive after and clobber this revert with the (wrong) optimistic
  // state. `nextTick()` lets any already-queued Sortable/Vue updates from
  // this same drag gesture settle first, so this revert is the last write.
  await nextTick();
  syncColumnTasks();
  backlogPanelRef.value?.resync();
  boardRenderEpoch.value += 1;
}

// Impeccable re-critique P2 ("no confirmation on a successful move"): a
// move used to end in total silence, visually and for screen readers
// alike. `role="status" aria-live="polite"` announces it without
// interrupting whatever the user is doing next, and clears itself so it
// never reads as a persistent state.
const moveStatusMessage = ref<string | null>(null);
let moveStatusTimer: ReturnType<typeof setTimeout> | null = null;

function announceMoveSuccess(message: string) {
  moveStatusMessage.value = message;
  if (moveStatusTimer) clearTimeout(moveStatusTimer);
  moveStatusTimer = setTimeout(() => {
    moveStatusMessage.value = null;
  }, 2500);
}

function stageName(stageId: string): string {
  return stages.value.find((s) => s.id === stageId)?.name ?? stageId;
}

// Impeccable re-critique P1 ("keyboard reach scales linearly with board
// position"): a keyboard user reaching column N had to Tab through every
// card in every prior column plus the whole expanded backlog. These jump
// targets (rendered as standard sr-only-until-focus skip links) move focus
// straight to a lane's first card without walking there.
function focusLane(selector: string) {
  const container = document.querySelector<HTMLElement>(selector);
  if (!container) return;
  const firstCard = container.querySelector<HTMLElement>(".card[data-task-id]");
  const fallback = container.matches("h2, button") ? container : container.querySelector<HTMLElement>("h2, button");
  (firstCard ?? fallback)?.focus();
  container.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
}

function focusColumn(stageId: string) {
  focusLane(`.column[data-stage-id="${stageId}"]`);
}

// Keyboard/click-triggered alternative to dragging (Impeccable critique P0)
// — same two mutations onDropOnStage/confirmPendingMove already perform,
// just reachable without a mouse.
const actionMenuTaskId = ref<string | null>(null);
const actionMenuTargetStageId = ref("");
const actionMenuAssigneeUserId = ref("");
const isActionMenuOpen = computed(() => actionMenuTaskId.value !== null);
const actionMenuTask = computed(() => tasks.value.find((t) => t.id === actionMenuTaskId.value) ?? null);

useDialogFocusTrap(
  pendingMoveDialogRef,
  computed(() => pendingMove.value !== null),
);
useDialogFocusTrap(actionMenuDialogRef, isActionMenuOpen);

// The single assignee selection driving the担当者フォーカス表示
// (Requirement 1). "" = "すべて" (AssigneeFilter.vue's convention). Round 3:
// no longer also filters the stage board (see header comment) — kept in
// TeamWorkloadSummary's v-model purely to select who the focus tray shows.
const selectedAssigneeUserId = ref("");

// Requirement 1.2/1.3: selected assignee's incomplete tasks, any/no stage.
const focusedTasks = computed(() => computeFocusedTasks(tasks.value, selectedAssigneeUserId.value));
// Requirement 2.1-2.3: per-assignee counts, always all assignees.
const workloadCounts = computed(() => computeWorkloadCounts(tasks.value, users.value));
// Requirement 3.1/3.6: tasks with no development stage set.
const backlogTasks = computed(() => computeBacklogTasks(tasks.value));
// Requirement 5.4/5.5: completed/total child counts per parent task id.
const taskProgressById = computed(() => computeTaskProgressById(tasks.value));

// Sortable-mutable per-stage mirror of tasksForStage(stage.id) — see header
// comment on resync strategy. Keyed by stage id.
const columnTasksByStageId = reactive<Record<string, Task[]>>({});

function syncColumnTasks() {
  const nextIds = new Set(stages.value.map((s) => s.id));
  for (const key of Object.keys(columnTasksByStageId)) {
    if (!nextIds.has(key)) delete columnTasksByStageId[key];
  }
  for (const stage of stages.value) {
    // Round 3: always "all assignees" — the stage board is no longer
    // filtered by selectedAssigneeUserId (that's the focus tray's job now).
    columnTasksByStageId[stage.id] = computeTasksForStage(tasks.value, stage.id, "");
  }
}

watch([tasks, stages], syncColumnTasks, { immediate: true });

async function loadStages() {
  stages.value = await api.listDevelopmentStages();
}

async function loadTasks() {
  tasks.value = await api.listTasks();
}

function userName(userId: string | null | undefined): string | undefined {
  return users.value.find((u) => u.id === userId)?.name;
}

async function onDropOnStage(targetStageId: string, taskId: string) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task || task.developmentStageId === targetStageId) {
    // Impeccable third critique P1 ("a canceled/no-op drag silently
    // reorders the column, then silently un-reorders itself later"):
    // Sortable's `:model-value`/`@update:model-value` binding already
    // optimistically permuted `columnTasksByStageId`'s mirror by the time
    // this fires, even though nothing is being written here — without an
    // explicit revert, the visual order stayed wrong until some *other*
    // move anywhere on the board happened to trigger a reload. Snap it
    // back to the real order immediately instead, same as the picker's
    // own `cancelPendingMove` already does for its abort path.
    syncColumnTasks();
    return;
  }

  if (!task.assigneeUserId) {
    pendingMove.value = { taskId, targetStageId };
    pendingAssigneeUserId.value = "";
    return;
  }
  await api.updateTaskDevelopmentStage(taskId, targetStageId);
  await loadTasks();
  announceMoveSuccess(`「${task.title}」を${stageName(targetStageId)}に移動しました`);
}

// Shared `end` handler for every stage column's VueDraggable. No eager
// resync (see header comment) — just run the move logic if the card
// landed in a (different) stage column.
async function handleColumnDragEnd(evt: DraggableEvent) {
  hoveredStageId.value = null;
  const taskId = (evt.item as HTMLElement | undefined)?.dataset.taskId;
  const targetStageId = (evt.to as HTMLElement | undefined)?.dataset.stageId;
  if (taskId && targetStageId) {
    await onDropOnStage(targetStageId, taskId);
  }
}

// Live-updated while dragging over a stage column, for the whole-lane
// highlight (round 3: replaces the per-card insertion-point animation,
// since order within a column isn't persisted — see main.css).
function handleColumnChange(evt: DraggableEvent) {
  hoveredStageId.value = (evt.to as HTMLElement | undefined)?.dataset.stageId ?? null;
}

// UnassignedBacklogPanel doesn't resync itself on drop anymore; it only
// bubbles up the move outcome for us to act on.
//
// Impeccable fourth critique P1 ("drop-target highlight sticks permanently
// after any drag originating in the backlog panel or focus tray"): Sortable
// fires `onEnd` on the SOURCE list only, so `hoveredStageId` — set by a
// stage column's own `@change` while a drag hovers over it — was only ever
// cleared by `handleColumnDragEnd` (a drag that both started AND ended in a
// stage column). A drag starting here or in the focus tray never ran that
// reset, leaving whichever column was last hovered permanently outlined,
// even after a successful drop, a canceled one, or a drop back into this
// very panel (no `targetStageId` at all). Clearing it unconditionally,
// before checking `targetStageId`, covers all three cases the same way
// `handleColumnDragEnd` already does for its own drags.
async function handleBacklogDragEnd(payload: { taskId: string; targetStageId?: string }) {
  hoveredStageId.value = null;
  if (payload.targetStageId) {
    await onDropOnStage(payload.targetStageId, payload.taskId);
  }
}

// Mirrors handleBacklogDragEnd (including its hoveredStageId reset above):
// fires when a card is dragged OUT of the focus tray into a stage column.
// Every task shown in the tray already has the focused assignee, so
// onDropOnStage always takes its direct-update path (never the
// assignee-picker prompt) — no cancellation path needed.
async function handleFocusTrayDragEnd(payload: { taskId: string; targetStageId?: string }) {
  hoveredStageId.value = null;
  if (payload.targetStageId) {
    await onDropOnStage(payload.targetStageId, payload.taskId);
  }
}

// A card was dropped onto the focus tray: assign it to the currently
// focused user. Backend constraint (see header comment): this no-ops if
// the task already has an assignee — previously that reverted with zero
// explanation (Impeccable critique P0), so that case now sets
// `focusTrayError` for the ErrorAlert instead of failing silently.
//
// Impeccable fifth critique P0 ("rejected focus-tray reassignment makes
// the source task vanish from its stage column until a hard reload"): when
// the dragged card came from a STAGE COLUMN (not the backlog), Sortable's
// `:model-value`/`@update:model-value` binding had already optimistically
// removed it from that column's `columnTasksByStageId` mirror by the time
// this rejection branch runs — this only ever resynced the tray itself
// (`focusTrayRef`), never the source column or the backlog, so a rejected
// drop left the source looking like the task had vanished, with no write
// having actually happened. Same failure family as the phantom-reorder fix
// (round 3) and the stuck-highlight fix (round 4): revert every mirror a
// drag could have optimistically touched, not just the one this handler
// happens to own.
async function handleFocusTrayAssign(taskId: string) {
  focusTrayError.value = null;
  const task = tasks.value.find((t) => t.id === taskId);
  if (task && !task.assigneeUserId && selectedAssigneeUserId.value) {
    await api.updateTaskDevelopmentStage(taskId, task.developmentStageId ?? null, selectedAssigneeUserId.value);
    await loadTasks();
    announceMoveSuccess(`「${task.title}」を${userName(selectedAssigneeUserId.value) ?? ""}に割り当てました`);
  } else if (task?.assigneeUserId) {
    focusTrayError.value = "既に担当者が設定されているタスクは、ここでは再割り当てできません。";
    await revertOptimisticMove();
  }
  focusTrayRef.value?.resync();
}

// Opens the keyboard/click action menu for a task (Impeccable critique P0)
// — reached via TaskCard's `activate`/`card-activate` emit, wherever the
// card happens to be rendered (stage board, focus tray, backlog panel).
function openActionMenu(taskId: string) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task) return;
  actionMenuTaskId.value = taskId;
  actionMenuTargetStageId.value = task.developmentStageId ?? "";
  actionMenuAssigneeUserId.value = "";
}

function closeActionMenu() {
  actionMenuTaskId.value = null;
  actionMenuTargetStageId.value = "";
  actionMenuAssigneeUserId.value = "";
}

// Same two writes onDropOnStage/confirmPendingMove already perform for a
// drag — an unassigned task moving to a new stage must pick an assignee in
// the same step (Requirement 12.6/12.7), an already-assigned task just
// moves. This keeps keyboard parity with drag rather than adding a new
// capability drag doesn't have.
// Impeccable sixth critique P1 ("action menu announces a false 'moved'
// success on a same-stage no-op confirm"): `openActionMenu` defaults
// `actionMenuTargetStageId` to the task's CURRENT stage, so confirming
// without touching the select — an entirely ordinary "I just wanted to
// check/reassign, not move it" click — used to fall through both branches
// below (no write happens either way) straight into an unconditional
// close+reload+announce, telling the user a move happened when nothing
// was written. `onDropOnStage`'s identical same-stage case has always
// handled this correctly (silent no-op, no announcement) — this only
// ever announces (and only reloads) once a write actually occurred,
// mirroring that. The confirm button is also disabled for this exact
// case below, so this guard is defense-in-depth, not the only line of
// defense.
async function confirmActionMenu() {
  const task = actionMenuTask.value;
  if (!task || !actionMenuTargetStageId.value) return;
  const targetStageId = actionMenuTargetStageId.value;
  let wroteChange = false;
  if (!task.assigneeUserId) {
    if (!actionMenuAssigneeUserId.value) return;
    await api.updateTaskDevelopmentStage(task.id, targetStageId, actionMenuAssigneeUserId.value);
    wroteChange = true;
  } else if (targetStageId !== (task.developmentStageId ?? "")) {
    await api.updateTaskDevelopmentStage(task.id, targetStageId);
    wroteChange = true;
  }
  closeActionMenu();
  if (wroteChange) {
    await loadTasks();
    announceMoveSuccess(`「${task.title}」を${stageName(targetStageId)}に移動しました`);
  }
}

async function confirmPendingMove() {
  if (!pendingMove.value || !pendingAssigneeUserId.value) return;
  const task = tasks.value.find((t) => t.id === pendingMove.value?.taskId);
  const { targetStageId } = pendingMove.value;
  await api.updateTaskDevelopmentStage(pendingMove.value.taskId, targetStageId, pendingAssigneeUserId.value);
  pendingMove.value = null;
  pendingAssigneeUserId.value = "";
  await loadTasks();
  if (task) announceMoveSuccess(`「${task.title}」を${stageName(targetStageId)}に移動しました`);
}

// The only place that reverts an optimistic Sortable move (see header
// comment) — the dragged task never actually changed on the server, so
// re-deriving every local mirror from `tasks`/`props.tasks` (unchanged)
// puts everything back exactly where it was.
async function cancelPendingMove() {
  pendingMove.value = null;
  pendingAssigneeUserId.value = "";
  await revertOptimisticMove();
  focusTrayRef.value?.resync();
}

onMounted(async () => {
  await loadStages();
  await loadTasks();
  users.value = await api.listUsers();
});
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">カンバン</h1>
      <NuxtLink
        to="/kanban/stages"
        class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
        開発段階の管理
      </NuxtLink>
    </div>

    <p v-if="moveStatusMessage" role="status" aria-live="polite" class="rounded-md bg-green-100 px-3 py-2 text-sm text-green-700">
      {{ moveStatusMessage }}
    </p>

    <!-- Impeccable re-critique P1: sr-only-until-focus skip links, the
         standard "skip navigation" pattern — invisible to sighted mouse
         users (no permanent chrome added), but let a keyboard user jump
         straight to any lane instead of Tabbing through every card first. -->
    <nav aria-label="レーンへ移動" class="flex flex-wrap gap-2">
      <button
        type="button"
        class="sr-only focus:not-sr-only focus:relative focus:z-20 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
        @click="focusLane('.backlog-panel')"
      >
        未割り当てへ移動
      </button>
      <button
        v-if="selectedAssigneeUserId"
        type="button"
        class="sr-only focus:not-sr-only focus:relative focus:z-20 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
        @click="focusLane('.focus-tray')"
      >
        担当者フォーカスへ移動
      </button>
      <button
        v-for="stage in stages"
        :key="`jump-${stage.id}`"
        type="button"
        class="sr-only focus:not-sr-only focus:relative focus:z-20 focus:rounded-md focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
        @click="focusColumn(stage.id)"
      >
        {{ stage.name }}へ移動
      </button>
    </nav>

    <TeamWorkloadSummary v-model="selectedAssigneeUserId" :counts="workloadCounts" />

    <template v-if="selectedAssigneeUserId">
      <ErrorAlert v-if="focusTrayError" :message="focusTrayError" />
      <AssigneeFocusTray
        ref="focusTrayRef"
        :tasks="focusedTasks"
        :users="users"
        @assign="handleFocusTrayAssign"
        @end="handleFocusTrayDragEnd"
        @card-activate="openActionMenu"
      />
    </template>

    <p v-if="stages.length === 0" class="text-sm text-slate-600">
      開発段階が未登録です。「開発段階の管理」から登録してください。
    </p>

    <div
      v-if="pendingMove"
      ref="pendingMoveDialogRef"
      class="assignee-picker space-y-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200"
      role="dialog"
      aria-modal="true"
      aria-label="担当者を選択"
      @keydown.esc="cancelPendingMove"
    >
      <p class="text-sm text-amber-900">このタスクは担当者が未設定です。移動と同時に担当者を選択してください。</p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="pendingAssigneeUserId"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="" disabled>担当者を選択</option>
          <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
        </select>
        <button
          type="button"
          :disabled="!pendingAssigneeUserId"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="confirmPendingMove"
        >
          確定
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="cancelPendingMove"
        >
          キャンセル
        </button>
      </div>
    </div>

    <div
      v-if="actionMenuTask"
      ref="actionMenuDialogRef"
      class="task-action-menu space-y-3 rounded-lg bg-white p-4 ring-1 ring-slate-200"
      role="dialog"
      aria-modal="true"
      :aria-label="`${actionMenuTask.title}の操作`"
      @keydown.esc="closeActionMenu"
    >
      <p class="text-sm font-medium text-slate-900">{{ actionMenuTask.title }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-xs font-medium text-slate-500" for="action-menu-stage">移動先</label>
        <select
          id="action-menu-stage"
          v-model="actionMenuTargetStageId"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.name }}</option>
        </select>
        <template v-if="!actionMenuTask.assigneeUserId">
          <label class="text-xs font-medium text-slate-500" for="action-menu-assignee">担当者</label>
          <select
            id="action-menu-assignee"
            v-model="actionMenuAssigneeUserId"
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="" disabled>担当者を選択</option>
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
          </select>
        </template>
        <button
          type="button"
          :disabled="
            !actionMenuTargetStageId ||
            (!actionMenuTask.assigneeUserId && !actionMenuAssigneeUserId) ||
            (!!actionMenuTask.assigneeUserId && actionMenuTargetStageId === (actionMenuTask.developmentStageId ?? ''))
          "
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="confirmActionMenu"
        >
          移動する
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="closeActionMenu"
        >
          キャンセル
        </button>
      </div>
    </div>

    <div class="board flex items-start gap-4 overflow-x-auto pb-2">
      <UnassignedBacklogPanel
        ref="backlogPanelRef"
        :tasks="backlogTasks"
        :users="users"
        @end="handleBacklogDragEnd"
        @card-activate="openActionMenu"
      />

      <div
        v-for="stage in stages"
        :key="stage.id"
        class="column w-72 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors"
        :class="{ 'kanban-drop-target-active': hoveredStageId === stage.id }"
        :data-stage-id="stage.id"
      >
        <div class="mb-3 flex items-center gap-2 px-1">
          <h2 class="text-sm font-semibold text-slate-700" tabindex="-1">{{ stage.name }}</h2>
          <Badge tone="neutral" :label="String((columnTasksByStageId[stage.id] ?? []).length)" />
        </div>
        <VueDraggable
          :key="`${stage.id}-${boardRenderEpoch}`"
          :model-value="columnTasksByStageId[stage.id] ?? []"
          @update:model-value="(val: Task[]) => (columnTasksByStageId[stage.id] = val)"
          :group="{ name: 'kanban-cards', pull: true, put: true }"
          :sort="false"
          :animation="200"
          :force-fallback="true"
          :fallback-on-body="true"
          ghost-class="task-card-ghost"
          chosen-class="task-card-chosen"
          fallback-class="task-card-drag-clone"
          :on-move="preventSameListMove"
          class="card-list min-h-12 max-h-[36rem] space-y-2 overflow-y-auto"
          :data-stage-id="stage.id"
          @change="handleColumnChange"
          @end="handleColumnDragEnd"
        >
          <TaskCard
            v-for="task in columnTasksByStageId[stage.id] ?? []"
            :key="task.id"
            :task="task"
            :assignee-name="userName(task.assigneeUserId)"
            :progress="taskProgressById.get(task.id)"
            @activate="openActionMenu(task.id)"
          />
        </VueDraggable>
      </div>
    </div>
  </div>
</template>
