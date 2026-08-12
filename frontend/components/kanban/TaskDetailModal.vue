<!--
  Task detail/edit/delete modal (kanban-ux-redesign spec Requirement 8,
  "実装後の改訂" 4. — supersedes the task-delivery-management task 3.3
  action-menu entry point). Opens directly from a TaskCard click/activate;
  the separate keyboard-only "action menu" dialog that used to live in
  kanban/index.vue has been removed, and this modal absorbs its
  keyboard-accessible development-stage move (Requirement 8.8) via the
  edit-mode developmentStage select.

  Chrome (overlay, open/close animation, focus trap, close button) is
  delegated to the shared `Modal` component (frontend/components/shared/
  Modal.vue, Requirement 8.9) — this component only supplies domain
  content via its title/default/actions slots. Always mounted in
  kanban/index.vue (not v-if-wrapped by the parent) so `Modal`'s internal
  `useDialogFocusTrap` reliably fires open/close transitions as `taskId`
  toggles between a value and null.

  Fetches the full task via GET /api/tasks/:id on open rather than trusting
  the (possibly stale) row from the board's `tasks` list.

  task-status-model 5.3: view-mode stage uses StageBadge (modal prefix);
  terminal stages omit StatusBadge; badge order keeps StageBadge fixed when
  status is hidden (Priority → Stage → Status? → assignee → case).

  Starts in read-only "view" mode (Requirement 8.2) and switches to "edit"
  only via the explicit edit button (Requirement 8.3); saving returns to
  view mode rather than closing, so the user can see the result in place
  (Requirement 8.4). `mode` resets to "view" whenever `taskId` changes.

  The title slot shows the live `title` form ref (not just the loaded
  task's persisted title) so the header stays in sync while editing,
  rather than only updating on save.

  Saving splits into two API calls: `PATCH /api/tasks/:id` (title/priority/
  detail/assignee/caseId/isRequiredForCase — task-delivery-management task 3.3,
  case-management-ux task 7) always runs, and `PATCH /api/tasks/:id/
  development-stage` only runs when the stage field actually changed (that
  endpoint is otherwise unrelated to this edit and has its own
  assignee-preserving semantics we don't want to invoke needlessly).
  `assigneeUserId` is never passed to the stage-update call — the general
  update already applied it. `caseId`/`isRequiredForCase` follow the same
  single-generic-update pattern as the rest of that call (case-management-ux
  design.md TaskDetailModal — 案件セクション追加 explicitly avoids a
  separate call here, unlike the stage field).

  Delete requires an inline confirm step (`confirmingDelete`) rather than
  `window.confirm`, consistent with this app avoiding native browser
  dialogs elsewhere on the kanban page. Errors are always caught and shown
  via ErrorAlert, per .kiro/steering/error-handling.md.
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Case, DevelopmentStage, Priority, Task, User } from "../../composables/useApiClient";
import { useApiClient } from "../../composables/useApiClient";
import { isTaskClosed } from "../../composables/useTaskClosure";
import StageBadge from "../shared/StageBadge.vue";

const props = defineProps<{ taskId: string | null; users: User[]; stages: DevelopmentStage[]; cases: Case[] }>();
const emit = defineEmits<{
  close: [];
  saved: [task: Task];
  deleted: [task: { id: string; title: string }];
}>();

const api = useApiClient();
const isOpen = computed(() => props.taskId !== null);

const mode = ref<"view" | "edit">("view");
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const task = ref<Task | null>(null);
const confirmingDelete = ref(false);

const title = ref("");
const priority = ref<Priority>("medium");
const detail = ref("");
const assigneeUserId = ref("");
const developmentStageId = ref("");
const caseId = ref("");
const isRequiredForCase = ref(false);

const assigneeName = computed(() => props.users.find((u) => u.id === task.value?.assigneeUserId)?.name);
const caseName = computed(() => props.cases.find((c) => c.id === task.value?.caseId)?.name ?? "—");

const stage = computed(() => {
  const stageId = task.value?.developmentStageId;
  if (stageId == null) return null;
  return props.stages.find((entry) => entry.id === stageId) ?? null;
});

const closed = computed(() => (task.value ? isTaskClosed(task.value, props.stages) : false));

function resetForm(loaded: Task) {
  title.value = loaded.title;
  priority.value = loaded.priority;
  detail.value = loaded.detail ?? "";
  assigneeUserId.value = loaded.assigneeUserId ?? "";
  developmentStageId.value = loaded.developmentStageId ?? "";
  caseId.value = loaded.caseId ?? "";
  isRequiredForCase.value = loaded.isRequiredForCase;
}

// Requirement 4.6: clearing the case selection resets the required toggle's
// local UI state immediately, ahead of save — the backend independently
// enforces this same rule regardless of what's sent.
watch(caseId, (value) => {
  if (!value) isRequiredForCase.value = false;
});

watch(
  () => props.taskId,
  async (id) => {
    error.value = null;
    confirmingDelete.value = false;
    mode.value = "view";
    task.value = null;
    if (!id) return;
    loading.value = true;
    try {
      const loaded = await api.getTask(id);
      task.value = loaded;
      resetForm(loaded);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function startEdit() {
  if (task.value) resetForm(task.value);
  mode.value = "edit";
}

function cancelEdit() {
  if (task.value) resetForm(task.value);
  mode.value = "view";
}

async function save() {
  if (!props.taskId || !task.value) return;
  error.value = null;
  saving.value = true;
  try {
    let updated = await api.updateTask(props.taskId, {
      title: title.value,
      priority: priority.value,
      detail: detail.value.trim().length > 0 ? detail.value : null,
      assigneeUserId: assigneeUserId.value || null,
      caseId: caseId.value || null,
      isRequiredForCase: isRequiredForCase.value,
    });
    if (developmentStageId.value !== (task.value.developmentStageId ?? "")) {
      updated = await api.updateTaskDevelopmentStage(props.taskId, developmentStageId.value || null);
    }
    task.value = updated;
    resetForm(updated);
    mode.value = "view";
    emit("saved", updated);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function confirmDelete() {
  if (!props.taskId || !task.value) return;
  error.value = null;
  saving.value = true;
  try {
    await api.deleteTask(props.taskId);
    emit("deleted", { id: props.taskId, title: task.value.title });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    confirmingDelete.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal class="task-detail-modal" :open="isOpen" ariaLabel="タスクの詳細" @close="emit('close')">
    <template #title>{{ task ? title : "読み込み中…" }}</template>

    <ErrorAlert v-if="error" :message="error" />

    <p v-if="loading" class="text-sm text-slate-500">読み込み中…</p>

    <template v-else-if="task">
      <!-- 閲覧モード(既定): 編集不可の表示のみ(Requirement 8.2) -->
      <div v-if="mode === 'view'" class="space-y-3">
        <div data-testid="task-detail-badges" class="flex flex-wrap items-center gap-2">
          <PriorityBadge :priority="task.priority" />
          <StageBadge :kind="stage?.kind ?? null" :name="stage?.name ?? null" prefix-mode="modal" />
          <StatusBadge v-if="!closed" :status="task.status" />
          <Badge tone="neutral" :label="`担当者: ${assigneeName ?? '未設定'}`" />
          <Badge tone="neutral" :label="`案件: ${caseName}${task.caseId && task.isRequiredForCase ? '(必須)' : ''}`" />
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-500">詳細</span>
          <p class="whitespace-pre-wrap rounded-md bg-slate-50 px-2.5 py-2 text-sm text-slate-700">
            {{ task.detail?.trim() ? task.detail : "—" }}
          </p>
        </div>
      </div>

      <!-- 編集モード: 編集ボタン経由でのみ到達(Requirement 8.3) -->
      <form v-else id="task-detail-form" class="space-y-3" @submit.prevent="save">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-slate-500" for="task-detail-title">タイトル</label>
          <input
            id="task-detail-title"
            v-model="title"
            required
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div class="flex flex-wrap items-end gap-2">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-500" for="task-detail-priority">優先度</label>
            <select
              id="task-detail-priority"
              v-model="priority"
              class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-500" for="task-detail-stage">開発段階</label>
            <select
              id="task-detail-stage"
              v-model="developmentStageId"
              class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">未設定</option>
              <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.name }}</option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-500" for="task-detail-assignee">担当者</label>
            <select
              id="task-detail-assignee"
              v-model="assigneeUserId"
              class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">未設定</option>
              <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
            </select>
          </div>
        </div>

        <!-- 案件セクション: 優先度/開発段階/担当者のグリッドとは視覚的に分離
             した枠線付きブロック(design.md TaskDetailModal — 案件セクション
             追加、mockup 1g準拠)。 -->
        <div class="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-500" for="task-detail-case">案件</label>
            <select
              id="task-detail-case"
              v-model="caseId"
              class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">案件に紐づけない(未設定)</option>
              <option v-for="c in cases" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-700">
            <button
              type="button"
              role="switch"
              :aria-checked="isRequiredForCase"
              aria-label="この案件の必須タスクにする"
              :disabled="!caseId"
              class="toggle-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="isRequiredForCase ? 'bg-primary-600' : 'bg-slate-300'"
              @click="isRequiredForCase = !isRequiredForCase"
            >
              <span
                class="toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                :class="isRequiredForCase ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </button>
            必須タスクにする
          </label>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-slate-500" for="task-detail-detail">詳細</label>
          <textarea
            id="task-detail-detail"
            v-model="detail"
            rows="4"
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </form>
    </template>

    <template v-if="task" #actions>
      <template v-if="mode === 'view'">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            @click="startEdit"
          >
            編集
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="emit('close')"
          >
            閉じる
          </button>
        </div>

        <div v-if="!confirmingDelete">
          <button
            type="button"
            class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            @click="confirmingDelete = true"
          >
            削除
          </button>
        </div>
        <div v-else class="flex items-center gap-2">
          <span class="text-xs text-red-700">本当に削除しますか?</span>
          <button
            type="button"
            :disabled="saving"
            class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            @click="confirmDelete"
          >
            削除する
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="confirmingDelete = false"
          >
            キャンセル
          </button>
        </div>
      </template>

      <div v-else class="flex items-center gap-2">
        <button
          type="submit"
          form="task-detail-form"
          :disabled="saving || !title.trim()"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="cancelEdit"
        >
          キャンセル
        </button>
      </div>
    </template>
  </Modal>
</template>
