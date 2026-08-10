<!--
  Kanban board page (task 4.2, design.md "kanban/index.vue" component
  detail block, Requirements 1.1/1.4/1.5, 2.4/2.5, 3.2/3.3, 4.1-4.3,
  6.1/6.2, 7.2). Development stage master CRUD (create/rename/reorder/
  delete) has moved to /kanban/stages (frontend/pages/kanban/stages.vue);
  this page only reads stages to render the board's columns.

  Drag-and-drop uses vue-draggable-plus (Sortable.js) instead of the
  browser-standard HTML5 Drag and Drop API, for lift/cursor-follow/
  sibling-reflow animation the native API can't give without heavy custom
  work (design.md Technology Stack allows this library swap). Each stage
  column's card list and UnassignedBacklogPanel's/AssigneeFocusTray's
  lists are separate `VueDraggable` instances sharing one Sortable `group`
  ("kanban-cards"), so a card can be dragged between any of them.

  Resync strategy: none of these lists have a persisted "position" field,
  so `columnTasksByStageId`/child components' local mirrors are NOT
  eagerly force-resynced on every drag end — that fights Sortable's own
  internal bookkeeping and its drop animation. A successful move flows
  back naturally (API call → `loadTasks()` → the `watch(tasks, ...)` below
  recomputes everything). An ABORTED move (assignee-picker canceled) is
  the only case needing an explicit revert, done once in
  `cancelPendingMove()` — by then Sortable's transition has long finished,
  so there's no timing race.

  Board-wide assignee filtering does not exist — filtering lives only in
  AssigneeFocusTray. A chip click drives only the focus tray, not also the
  stage board, since filtering both would be redundant. Dropping a card
  onto the focus tray assigns it to the focused user
  (`handleFocusTrayAssign`), always overwriting any existing assignee
  (kanban-ux-redesign Requirement 9) via the general `updateTask` API —
  distinct from `updateDevelopmentStage`'s stage-column-move semantics
  (task-delivery-management Requirement 12.8), which this does not touch
  or change.

  Judgment call carried over from the pre-redesign version
  (requirements.md/design.md are silent on this): a task never has a
  development stage until someone sets one, and Requirement 3's stage
  board excludes stage-less tasks from the per-stage columns — those are
  surfaced instead via UnassignedBacklogPanel (Requirement 3), which is
  also this page's drag SOURCE for stage-less tasks. Its `put: false`
  Sortable group setting enforces "not itself a valid drop target"
  declaratively.

  A failed focus-tray reassignment (a real API error) surfaces via
  `focusTrayError` and the shared `ErrorAlert` (the same pattern every
  other page in this app uses for backend errors, per
  `.kiro/steering/error-handling.md`) rather than reverting silently.
  (kanban-ux-redesign Requirement 9: dropping a card on the focus tray
  always reassigns it to the focused user, overwriting any existing
  assignee via the general `updateTask` API — this is a deliberate later
  amendment; see design.md "実装後の改訂" 4. It used to be a no-op guarded
  against `updateDevelopmentStage`'s assignee-preserving constraint, which
  no longer applies here.)

  Every `TaskCard` (in the stage board, the focus tray, and the backlog
  panel) is focusable and emits `activate`/`card-activate`, which now
  opens the task detail/edit/delete popup (`TaskDetailModal`, via
  `detailTaskId`) directly (kanban-ux-redesign Requirement 8 — this
  replaces an earlier keyboard-operable "action menu" dialog that offered
  a stage-move-only shortcut; that dialog is gone, and the popup's edit
  mode absorbs its keyboard-accessible stage move via a development-stage
  select). Dragging is separated from a plain click/tap by Sortable's own
  default movement-threshold behavior (no `delay` option set) — a click or
  tap with no pointer movement never starts a sort, so the underlying
  `click` fires normally and opens the popup; moving the pointer any
  meaningful distance starts the drag immediately instead (an earlier
  version of this feature used Sortable's `delay` — a timed press-and-hold
  — for this instead, but real usage found holding still for a fixed delay
  before moving felt unnatural compared to "just drag it," so that was
  reverted in favor of this movement-based distinction, which is also what
  this codebase already relied on before this feature existed). The
  assignee-picker prompt still gets real dialog semantics via
  `useDialogFocusTrap` — `aria-modal`, initial focus on open, a Tab trap,
  and focus restored to whatever opened it on close (the detail/edit
  popup manages its own instance of the same composable).

  A move — by drag or a save that changes development stage in the detail
  popup — announces its outcome: `announceMoveSuccess()` sets
  `moveStatusMessage` after every successful write, surfaced as a
  `role="status" aria-live="polite"` banner (auto-clears after 2.5s),
  giving screen-reader users an announcement of the outcome as well as
  sighted ones.

  Each stage-column heading, the backlog toggle, and the focus tray
  heading form a `<nav>` "column jump" list (visually a `sr-only`
  skip-link style list, genuinely hidden except on focus, standard
  skip-link pattern) so a keyboard user can jump directly to any lane's
  first card instead of Tabbing through every card in every prior column.

  This page opts its `<main>` out of app.vue's shared `max-w-6xl` cap via
  `definePageMeta({ fullWidth: true })` — it is the one surface that needs
  a horizontally-scrolling row wider than that, and every element on the
  page (not just the board) shares this same single full width, so the
  board never straddles outside its own `<main>`/parent structurally.
  Deliberately no viewport units (`vw`) anywhere: `100vw` counts the
  vertical scrollbar's own width in most browsers, so it measures wider
  than the actually-visible viewport the instant a vertical scrollbar
  appears (short window, or a tall board).
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
const { currentId } = useCurrentWorkspace();
const stages = ref<DevelopmentStage[]>([]);

const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const cases = ref<Case[]>([]);
const pendingMove = ref<{ taskId: string; targetStageId: string } | null>(null);
const pendingAssigneeUserId = ref("");
const hoveredStageId = ref<string | null>(null);
const focusTrayError = ref<string | null>(null);

const focusTrayRef = ref<{ resync: () => void } | null>(null);
const backlogPanelRef = ref<{ resync: () => void } | null>(null);
const pendingMoveDialogRef = ref<HTMLElement | null>(null);

// Bumped to force the affected stage columns to fully remount (a fresh
// `:key`) after a rejected drop, rather than relying on a content-based
// re-sync of `columnTasksByStageId`. Sortable's `put: true` group
// physically moves the real DOM node into the tray via direct DOM APIs the
// instant a drop lands — before any business logic runs, and entirely
// outside Vue's virtual DOM. When a drop is rejected, the reactive array's
// *content* never changes (no API call fires), so Vue's keyed diff has
// nothing to react to and leaves the physically relocated DOM node exactly
// where Sortable put it. Only a full remount makes Vue recreate the DOM
// nodes from the (already correct) array instead of assuming nothing
// changed.
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

// `role="status" aria-live="polite"` announces a move's outcome (by drag
// or keyboard) without interrupting whatever the user is doing next, and
// clears itself so it never reads as a persistent state.
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

// Jump targets (rendered as standard sr-only-until-focus skip links) move
// focus straight to a lane's first card, so a keyboard user reaching
// column N doesn't have to Tab through every card in every prior column
// plus the whole expanded backlog first.
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

// タスク詳細/編集/削除モーダル。TaskCardのactivate(クリック/Enter/Space)で
// 直接開く一本化された導線(kanban-ux-redesign Requirement 8.1)。ステージ
// 移動のキーボード操作は、このモーダルの編集モードにある開発段階選択項目が
// 兼ねる(Requirement 8.8)。
const detailTaskId = ref<string | null>(null);

useDialogFocusTrap(
  pendingMoveDialogRef,
  computed(() => pendingMove.value !== null),
);

// The single assignee selection driving the担当者フォーカス表示
// (Requirement 1). "" = "すべて". Does not filter the stage board (see
// header comment) — drives only which assignee the focus tray shows.
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
    // Always "all assignees" — the stage board is not filtered by
    // selectedAssigneeUserId; that's the focus tray's job.
    columnTasksByStageId[stage.id] = computeTasksForStage(tasks.value, stage.id, "");
  }
}

watch([tasks, stages], syncColumnTasks, { immediate: true });

async function loadStages() {
  if (currentId.value === null) return;
  stages.value = await api.listDevelopmentStages();
}

async function loadCases() {
  if (currentId.value === null) return;
  cases.value = await api.listCases();
}

async function loadTasks() {
  if (currentId.value === null) return;
  tasks.value = await api.listTasks();
}

function userName(userId: string | null | undefined): string | undefined {
  return users.value.find((u) => u.id === userId)?.name;
}

async function onDropOnStage(targetStageId: string, taskId: string) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task || task.developmentStageId === targetStageId) {
    // Sortable's `:model-value`/`@update:model-value` binding already
    // optimistically permutes `columnTasksByStageId`'s mirror by the time
    // this fires, even when nothing is being written here — without an
    // explicit revert, the visual order would stay wrong until some other
    // move anywhere on the board happened to trigger a reload. Snap it
    // back to the real order immediately instead, same as the picker's
    // own `cancelPendingMove` does for its abort path.
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
// highlight (rather than a per-card insertion-point animation, since order
// within a column isn't persisted — see main.css).
function handleColumnChange(evt: DraggableEvent) {
  hoveredStageId.value = (evt.to as HTMLElement | undefined)?.dataset.stageId ?? null;
}

// UnassignedBacklogPanel doesn't resync itself on drop; it only bubbles up
// the move outcome for us to act on.
//
// `hoveredStageId` is cleared unconditionally here, before checking
// `targetStageId`. Sortable fires `onEnd` on the SOURCE list only, so
// `hoveredStageId` — set by a stage column's own `@change` while a drag
// hovers over it — is only ever cleared by `handleColumnDragEnd` (a drag
// that both started AND ended in a stage column). A drag starting here or
// in the focus tray would never run that reset otherwise, leaving
// whichever column was last hovered permanently outlined, even after a
// successful drop, a canceled one, or a drop back into this very panel (no
// `targetStageId` at all). Clearing it unconditionally covers all three
// cases the same way `handleColumnDragEnd` does for its own drags.
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
// focused user, overwriting any existing assignee (kanban-ux-redesign
// Requirement 9). Uses the general `updateTask` API (task-delivery-
// management task 3.3) rather than `updateDevelopmentStage`, since the
// latter deliberately never overwrites an existing assignee (that rule is
// specific to stage-column moves, Requirement 12.8, and doesn't apply to
// this drop target) and also isn't the right fit here (this drop never
// changes developmentStageId).
//
// No-ops (skipping the API call and any announcement) when the task
// already has the focused user as its assignee — otherwise every drop
// would announce a "change" that didn't happen.
//
// On a real API failure, `focusTrayError` surfaces it via the shared
// ErrorAlert (`.kiro/steering/error-handling.md`) and
// `revertOptimisticMove()` reverts every mirror a drag could have
// optimistically touched (not just the tray itself): when the dragged
// card came from a STAGE COLUMN (not the backlog), Sortable's
// `:model-value`/`@update:model-value` binding has already optimistically
// removed it from that column's `columnTasksByStageId` mirror by the time
// this catch runs. Resyncing only the tray would leave the source column
// looking like the task had vanished, even though no write ever happened.
async function handleFocusTrayAssign(taskId: string) {
  focusTrayError.value = null;
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task || !selectedAssigneeUserId.value) {
    focusTrayRef.value?.resync();
    return;
  }
  if (task.assigneeUserId === selectedAssigneeUserId.value) {
    focusTrayRef.value?.resync();
    return;
  }
  try {
    await api.updateTask(taskId, { assigneeUserId: selectedAssigneeUserId.value });
    await loadTasks();
    announceMoveSuccess(`「${task.title}」を${userName(selectedAssigneeUserId.value) ?? ""}に割り当てました`);
  } catch (e) {
    focusTrayError.value = e instanceof Error ? e.message : String(e);
    await revertOptimisticMove();
  }
  focusTrayRef.value?.resync();
}

// Opens the detail/edit/delete modal for a task — reached via TaskCard's
// `activate`/`card-activate` emit, wherever the card happens to be
// rendered (stage board, focus tray, backlog panel).
function openTaskDetail(taskId: string) {
  detailTaskId.value = taskId;
}

function closeTaskDetail() {
  detailTaskId.value = null;
}

// TaskDetailModal自身が保存後に閲覧モードへ戻るため、ここではモーダルを
// 閉じずに一覧の再取得と結果アナウンスのみ行う。
async function onTaskDetailSaved(task: Task) {
  await loadTasks();
  announceMoveSuccess(`「${task.title}」を更新しました`);
}

async function onTaskDetailDeleted(deleted: { id: string; title: string }) {
  detailTaskId.value = null;
  await loadTasks();
  announceMoveSuccess(`「${deleted.title}」を削除しました`);
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

watch(
  currentId,
  (id) => {
    if (id === null) {
      stages.value = [];
      tasks.value = [];
      users.value = [];
      cases.value = [];
      return;
    }
    void (async () => {
      await loadStages();
      await loadTasks();
      users.value = await api.listUsers();
      await loadCases();
    })();
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-5">
    <div
      v-if="currentId === null"
      data-testid="workspace-empty-state"
      class="rounded-lg bg-white p-8 text-center ring-1 ring-slate-200"
    >
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">ワークスペースがありません</h1>
      <p class="mt-2 text-sm text-slate-600">
        最初のワークスペースを作成すると、メンバーを追加して共有の可視境界を持てます。
      </p>
      <NuxtLink
        to="/workspaces"
        class="mt-5 inline-block rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
      >
        ワークスペースを作成
      </NuxtLink>
    </div>

    <template v-else>
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

    <!-- sr-only-until-focus skip links, the standard "skip navigation"
         pattern — invisible to sighted mouse users (no permanent chrome
         added), but let a keyboard user jump straight to any lane instead
         of Tabbing through every card first. -->
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
        @card-activate="openTaskDetail"
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

    <TaskDetailModal
      :task-id="detailTaskId"
      :users="users"
      :stages="stages"
      :cases="cases"
      @close="closeTaskDetail"
      @saved="onTaskDetailSaved"
      @deleted="onTaskDetailDeleted"
    />

    <div class="board flex items-start gap-4 overflow-x-auto pb-2">
      <UnassignedBacklogPanel
        ref="backlogPanelRef"
        :tasks="backlogTasks"
        :users="users"
        @end="handleBacklogDragEnd"
        @card-activate="openTaskDetail"
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
            @activate="openTaskDetail(task.id)"
          />
        </VueDraggable>
      </div>
    </div>
    </template>
  </div>
</template>
