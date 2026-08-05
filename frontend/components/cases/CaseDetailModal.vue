<!--
  Case detail/edit/delete popup (task 6.3, design.md "Frontend / cases >
  CaseDetailModal", Requirements 5.1-5.4, 6.3, 7.2, 8.1-8.2, 9.1-9.2).
  Standalone here — not yet wired into cases/index.vue (that's task 8.1);
  this component only needs a nullable `caseId` prop, mirroring
  TaskDetailModal's `taskId` prop pattern so the parent controls
  open/closed by setting/clearing it.

  Chrome (overlay, open/close animation, focus trap, close button) is
  delegated to shared/Modal.vue, same as TaskDetailModal and
  CaseFormModal — this component only supplies domain content via its
  title/default/actions slots.

  Fetch-on-open (watch `caseId`): there is no single `GET /api/cases/:id`
  in useApiClient (design.md's API Contract only lists list/create/patch/
  progress/delete), and this task is explicitly barred from touching
  useApiClient.ts. So the case itself is fetched via `listCases()` +
  client-side `find(id)` (task 6.1's cases/index.vue already does the same
  listCases + getCaseProgress combo, so this isn't a new pattern). Progress
  (`getCaseProgress`) and the related-tasks list (`listTasks({ caseId })`)
  are fetched in parallel with it. If the id isn't found in the list
  (already deleted elsewhere), that's surfaced as an error rather than a
  silent blank modal.

  Starts in read-only "view" mode and switches to "edit" only via the
  explicit edit button; saving returns to view mode rather than closing
  (same flow as TaskDetailModal). After a successful save, progress is
  re-fetched too — `isCompleted` and `endDate` both feed
  `CaseProgress.isOverdueWithIncomplete`, so the view-mode badge would
  otherwise show a stale overdue state until the next full reopen.

  Editing does not touch task associations (Out of Boundary per design.md
  — task add/remove only happens at case-creation time via CaseFormModal
  or from the task's own detail popup via Requirement 4); the related-task
  list here is read-only, for context only.

  Delete requires the same inline confirm step (`confirmingDelete`) as
  TaskDetailModal, not `window.confirm` (design.md: "TaskDetailModalの
  confirmingDeleteと同じインライン確認ステップ").
-->
<script setup lang="ts">
import { buildUpdateCaseInput, validateCaseEditForm } from "./CaseDetailModal.helpers";

const props = defineProps<{ caseId: string | null }>();
const emit = defineEmits<{
  close: [];
  saved: [caseEntity: Case];
  deleted: [caseEntity: { id: string; name: string }];
}>();

const api = useApiClient();
const isOpen = computed(() => props.caseId !== null);

const mode = ref<"view" | "edit">("view");
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const confirmingDelete = ref(false);

const caseEntity = ref<Case | null>(null);
const progress = ref<CaseProgress | null>(null);
const relatedTasks = ref<Task[]>([]);

const name = ref("");
const startDate = ref("");
const endDate = ref("");
const isCompleted = ref(false);

function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function resetForm(loaded: Case) {
  name.value = loaded.name;
  startDate.value = toDateInputValue(loaded.startDate);
  endDate.value = toDateInputValue(loaded.endDate);
  isCompleted.value = loaded.isCompleted;
}

const statusBadge = computed(() => {
  if (!caseEntity.value) return null;
  if (caseEntity.value.isCompleted) return { tone: "success" as const, label: "完了" };
  if (progress.value?.isOverdueWithIncomplete) return { tone: "danger" as const, label: "期限超過" };
  return { tone: "info" as const, label: "進行中" };
});

const requiredProgressLabel = computed(() => {
  if (!progress.value) return "-";
  return `${progress.value.requiredCompleted} / ${progress.value.requiredTotal}`;
});

const requiredProgressRatio = computed(() => {
  if (!progress.value || progress.value.requiredTotal === 0) return 0;
  return Math.round((progress.value.requiredCompleted / progress.value.requiredTotal) * 100);
});

watch(
  () => props.caseId,
  async (id) => {
    error.value = null;
    confirmingDelete.value = false;
    mode.value = "view";
    caseEntity.value = null;
    progress.value = null;
    relatedTasks.value = [];
    if (!id) return;
    loading.value = true;
    try {
      const [list, loadedProgress, tasks] = await Promise.all([
        api.listCases(),
        api.getCaseProgress(id),
        api.listTasks({ caseId: id }),
      ]);
      const loaded = list.find((item) => item.id === id);
      if (!loaded) {
        throw new Error("案件が見つかりません。一覧を再読み込みしてください。");
      }
      caseEntity.value = loaded;
      progress.value = loadedProgress;
      relatedTasks.value = tasks;
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
  if (caseEntity.value) resetForm(caseEntity.value);
  error.value = null;
  mode.value = "edit";
}

function cancelEdit() {
  if (caseEntity.value) resetForm(caseEntity.value);
  error.value = null;
  mode.value = "view";
}

async function save() {
  if (!props.caseId || !caseEntity.value) return;
  error.value = null;
  const validation = validateCaseEditForm({ name: name.value, startDate: startDate.value, endDate: endDate.value });
  if (!validation.valid) {
    error.value = validation.error ?? "入力内容を確認してください";
    return;
  }

  saving.value = true;
  try {
    const updated = await api.updateCase(
      props.caseId,
      buildUpdateCaseInput({
        name: name.value,
        startDate: startDate.value,
        endDate: endDate.value,
        isCompleted: isCompleted.value,
      }),
    );
    caseEntity.value = updated;
    progress.value = await api.getCaseProgress(props.caseId);
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
  if (!props.caseId || !caseEntity.value) return;
  error.value = null;
  saving.value = true;
  try {
    await api.deleteCase(props.caseId);
    emit("deleted", { id: props.caseId, name: caseEntity.value.name });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    confirmingDelete.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal class="case-detail-modal" :open="isOpen" aria-label="案件の詳細" @close="emit('close')">
    <template #title>{{ caseEntity ? name : "読み込み中…" }}</template>

    <ErrorAlert v-if="error" :message="error" />

    <p v-if="loading" class="text-sm text-slate-500">読み込み中…</p>

    <template v-else-if="caseEntity">
      <!-- 閲覧モード(既定): 開始日・終了日・完了状態・必須タスク進捗・関連タスク一覧(Requirements 5.1, 6.3, 7.2) -->
      <div v-if="mode === 'view'" class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <Badge v-if="statusBadge" :tone="statusBadge.tone" :label="statusBadge.label" />
        </div>

        <div class="flex flex-wrap gap-4 text-sm">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-medium text-slate-500">開始日</span>
            <span class="text-slate-700">{{ caseEntity.startDate ? caseEntity.startDate.slice(0, 10) : "未設定" }}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-medium text-slate-500">終了日</span>
            <span class="text-slate-700">{{ caseEntity.endDate ? caseEntity.endDate.slice(0, 10) : "未設定" }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-500">必須タスク進捗</span>
          <div class="flex items-center gap-2">
            <span class="text-sm text-slate-700">{{ requiredProgressLabel }}</span>
            <div class="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-primary-500" :style="{ width: `${requiredProgressRatio}%` }" />
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-500">関連タスク</span>
          <p v-if="relatedTasks.length === 0" class="text-sm text-slate-600">関連付けられているタスクはありません</p>
          <ul v-else class="max-h-48 space-y-1.5 overflow-y-auto">
            <li
              v-for="task in relatedTasks"
              :key="task.id"
              class="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <span
                class="shrink-0 text-sm"
                :class="task.status === 'done' ? 'text-green-600' : 'text-slate-400'"
                :aria-label="task.status === 'done' ? '完了' : '未完了'"
              >
                {{ task.status === "done" ? "✓" : "○" }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm text-slate-800">{{ task.title }}</span>
              <Badge v-if="task.isRequiredForCase" tone="warning" label="必須" />
            </li>
          </ul>
        </div>
      </div>

      <!-- 編集モード: 編集ボタン経由でのみ到達(TaskDetailModalと同じフロー、Requirements 5.1-5.4) -->
      <form v-else id="case-detail-form" class="space-y-3" @submit.prevent="save">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-slate-500" for="case-detail-name">案件名</label>
          <input
            id="case-detail-name"
            v-model="name"
            required
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div class="flex flex-wrap items-end gap-2">
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-500">開始日</span>
            <DatePicker v-model="startDate" aria-label="開始日" />
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium text-slate-500">終了日</span>
            <DatePicker v-model="endDate" aria-label="終了日" />
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <button
            type="button"
            role="switch"
            :aria-checked="isCompleted"
            aria-label="この案件を完了にする"
            class="toggle-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
            :class="isCompleted ? 'bg-primary-600' : 'bg-slate-300'"
            @click="isCompleted = !isCompleted"
          >
            <span
              class="toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="isCompleted ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </button>
          この案件を完了にする
        </label>
      </form>
    </template>

    <template v-if="caseEntity" #actions>
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
          form="case-detail-form"
          :disabled="saving || !name.trim()"
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
