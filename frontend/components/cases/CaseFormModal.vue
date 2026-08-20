<script setup lang="ts">
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates";
import CaseTemplateApplyConfirm from "./CaseTemplateApplyConfirm.vue";
import type { MissingDates } from "./CaseTemplateApplyConfirm.helpers";
import {
  buildCreateCaseInput,
  buildTaskAssociationCalls,
  filterTasksByTitle,
  initSelectionState,
  isAllSelected,
  resolveMissingDates,
  selectAll,
  setRequired,
  setSelected,
  validateCaseForm,
  type SelectionState,
} from "./CaseFormModal.helpers";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [caseEntity: Case] }>();

const api = useApiClient();

const name = ref("");
const startDate = ref("");
const endDate = ref("");

const loadingTasks = ref(false);
const unassignedTasks = ref<Task[]>([]);
const selection = ref<SelectionState>({});
const searchQuery = ref("");

const saving = ref(false);
const error = ref<string | null>(null);
const createdCase = ref<Case | null>(null);
const associationErrors = ref<Array<{ taskId: string; title: string; message: string }>>([]);

const confirmOpen = ref(false);
const confirmMissingDates = ref<MissingDates>("both");

const visibleTasks = computed(() => filterTasksByTitle(unassignedTasks.value, searchQuery.value));
const allVisibleSelected = computed(() => isAllSelected(selection.value, visibleTasks.value.map((t) => t.id)));

function resetForm() {
  name.value = "";
  startDate.value = "";
  endDate.value = "";
  searchQuery.value = "";
  error.value = null;
  createdCase.value = null;
  associationErrors.value = [];
  unassignedTasks.value = [];
  selection.value = {};
  confirmOpen.value = false;
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    resetForm();
    loadingTasks.value = true;
    try {
      const tasks = await api.listTasks({ unassignedCase: true });
      unassignedTasks.value = tasks;
      selection.value = initSelectionState(tasks);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loadingTasks.value = false;
    }
  },
  { immediate: true },
);

function toggleTaskSelected(taskId: string, selected: boolean) {
  selection.value = setSelected(selection.value, taskId, selected);
}

function toggleTaskRequired(taskId: string, required: boolean) {
  selection.value = setRequired(selection.value, taskId, required);
}

function toggleSelectAll() {
  selection.value = selectAll(selection.value, visibleTasks.value.map((t) => t.id), !allVisibleSelected.value);
}

async function runAssociations(calls: Array<{ taskId: string; isRequiredForCase: boolean }>) {
  associationErrors.value = [];
  if (!createdCase.value) return;
  for (const call of calls) {
    try {
      await api.updateTask(call.taskId, { caseId: createdCase.value.id, isRequiredForCase: call.isRequiredForCase });
    } catch (e) {
      const title = unassignedTasks.value.find((t) => t.id === call.taskId)?.title ?? call.taskId;
      associationErrors.value.push({
        taskId: call.taskId,
        title,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function performCreate() {
  saving.value = true;
  try {
    const created = await api.createCase(
      buildCreateCaseInput({
        name: name.value,
        startDate: startDate.value,
        endDate: endDate.value,
      }),
    );
    createdCase.value = created;
    emit("created", created);
    await runAssociations(buildTaskAssociationCalls(selection.value));
    if (associationErrors.value.length === 0) {
      emit("close");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function submit() {
  if (createdCase.value) return;
  error.value = null;
  const validation = validateCaseForm({ name: name.value, startDate: startDate.value, endDate: endDate.value });
  if (!validation.valid) {
    error.value = validation.error ?? "入力内容を確認してください";
    return;
  }

  const missing = resolveMissingDates(startDate.value, endDate.value);
  if (missing !== null) {
    confirmMissingDates.value = missing;
    confirmOpen.value = true;
    return;
  }

  await performCreate();
}

function onConfirmClose() {
  confirmOpen.value = false;
}

async function onConfirmApprove(_operations: CaseTemplateApplyOperation[] | null) {
  confirmOpen.value = false;
  await performCreate();
}

async function retryFailedAssociations() {
  if (!createdCase.value) return;
  const calls = associationErrors.value.map((failure) => ({
    taskId: failure.taskId,
    isRequiredForCase: selection.value[failure.taskId]?.isRequiredForCase ?? false,
  }));
  saving.value = true;
  try {
    await runAssociations(calls);
    if (associationErrors.value.length === 0) {
      emit("close");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal class="case-form-modal" :open="open" ariaLabel="案件の登録" @close="emit('close')">
    <template #title>案件を登録</template>

    <ErrorAlert v-if="error" :message="error" />

    <ErrorAlert
      v-if="associationErrors.length > 0"
      :message="`次のタスクへの関連付けに失敗しました: ${associationErrors.map((f) => f.title).join('、')}`"
    />

    <p v-if="createdCase && associationErrors.length === 0" class="text-sm text-green-700" role="status">
      案件「{{ createdCase.name }}」を登録しました。関連付けを処理しています…
    </p>

    <form id="case-form" class="space-y-3" @submit.prevent="submit">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500" for="case-form-name">案件名</label>
        <input
          id="case-form-name"
          v-model="name"
          required
          :disabled="!!createdCase"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-500">開始日</span>
          <DatePicker v-if="!createdCase" v-model="startDate" ariaLabel="開始日" />
          <span v-else class="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-sm text-slate-500">
            {{ startDate || "未設定" }}
          </span>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-500">終了日</span>
          <DatePicker v-if="!createdCase" v-model="endDate" ariaLabel="終了日" />
          <span v-else class="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-sm text-slate-500">
            {{ endDate || "未設定" }}
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="m-0 text-sm font-semibold text-slate-700">未割り当てのタスク</h3>
          <button
            v-if="visibleTasks.length > 0"
            type="button"
            :disabled="!!createdCase"
            class="select-all-button rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            @click="toggleSelectAll"
          >
            {{ allVisibleSelected ? "すべて解除" : "すべて選択" }}
          </button>
        </div>

        <input
          v-model="searchQuery"
          type="text"
          placeholder="タスク名で検索"
          :disabled="!!createdCase"
          class="task-search w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />

        <p v-if="loadingTasks" class="text-sm text-slate-500">読み込み中…</p>
        <!-- Requirement 3.6: no assignable tasks at all. -->
        <p v-else-if="unassignedTasks.length === 0" class="empty-state text-sm text-slate-600">
          選択可能なタスクがありません
        </p>
        <p v-else-if="visibleTasks.length === 0" class="text-sm text-slate-600">検索条件に一致するタスクがありません</p>
        <ul v-else class="task-card-list max-h-64 space-y-2 overflow-y-auto">
          <li
            v-for="task in visibleTasks"
            :key="task.id"
            class="task-row flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2"
          >
            <button
              type="button"
              role="switch"
              :aria-checked="selection[task.id]?.selected ?? false"
              :aria-label="`${task.title} を選択`"
              :disabled="!!createdCase"
              class="toggle-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="selection[task.id]?.selected ? 'bg-primary-600' : 'bg-slate-300'"
              @click="toggleTaskSelected(task.id, !selection[task.id]?.selected)"
            >
              <span
                class="toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                :class="selection[task.id]?.selected ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </button>

            <span class="min-w-0 flex-1 truncate text-sm text-slate-800">{{ task.title }}</span>
            <PriorityBadge :priority="task.priority" />

            <label
              v-if="selection[task.id]?.selected"
              class="required-toggle flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600"
            >
              必須
              <button
                type="button"
                role="switch"
                :aria-checked="selection[task.id]?.isRequiredForCase ?? false"
                :aria-label="`${task.title} を必須タスクにする`"
                :disabled="!!createdCase"
                class="toggle-switch relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                :class="selection[task.id]?.isRequiredForCase ? 'bg-primary-600' : 'bg-slate-300'"
                @click="toggleTaskRequired(task.id, !selection[task.id]?.isRequiredForCase)"
              >
                <span
                  class="toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  :class="selection[task.id]?.isRequiredForCase ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </button>
            </label>
          </li>
        </ul>
      </div>
    </form>

    <template #actions>
      <div class="flex items-center gap-2">
        <button
          v-if="!createdCase"
          type="submit"
          form="case-form"
          :disabled="saving || !name.trim()"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          登録
        </button>
        <button
          v-else-if="associationErrors.length > 0"
          type="button"
          :disabled="saving"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="retryFailedAssociations"
        >
          再試行
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="emit('close')"
        >
          {{ createdCase ? "閉じる" : "キャンセル" }}
        </button>
      </div>
    </template>
  </Modal>

  <CaseTemplateApplyConfirm
    :open="confirmOpen"
    mode="create-missing"
    :missing-dates="confirmMissingDates"
    :start-date="startDate || null"
    :end-date="endDate || null"
    @close="onConfirmClose"
    @approve="onConfirmApprove"
  />
</template>
