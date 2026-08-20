<script setup lang="ts">
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates";
import {
  buildCandidateRows,
  buildDateChangeSummary,
  createMissingBody,
  formatDateSummary,
  hasDestructiveOperations,
  initConfirmState,
  reduceConfirm,
  selectedOperations,
  type ConfirmMode,
  type ConfirmState,
  type MissingDates,
} from "./CaseTemplateApplyConfirm.helpers";

const props = defineProps<{
  open: boolean;
  mode: ConfirmMode;
  missingDates?: MissingDates;
  startDate?: string | null;
  endDate?: string | null;
  oldStartDate?: string | null;
  oldEndDate?: string | null;
  candidates?: CaseTemplateApplyOperation[];
}>();

const emit = defineEmits<{
  close: [];
  approve: [operations: CaseTemplateApplyOperation[] | null];
}>();

const state = ref<ConfirmState>(
  initConfirmState({
    mode: props.mode,
    missingDates: props.missingDates,
    candidates: props.candidates ?? [],
  }),
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    state.value = initConfirmState({
      mode: props.mode,
      missingDates: props.missingDates,
      candidates: props.candidates ?? [],
    });
  },
  { immediate: true },
);

watch(
  () => state.value.outcome,
  (outcome) => {
    if (!outcome) return;
    if (outcome.type === "abort") {
      emit("close");
      return;
    }
    emit("approve", outcome.operations);
  },
);

const title = computed(() => {
  switch (state.value.screen) {
    case "A":
      return "案件を作成しますか?";
    case "B":
      return "テンプレートタスクへの反映";
    case "C":
      return "実行内容の確認";
  }
});

const missingBody = computed(() =>
  props.missingDates ? createMissingBody(props.missingDates) : "",
);

const startSummary = computed(() => formatDateSummary(props.startDate));
const endSummary = computed(() => formatDateSummary(props.endDate));
const startChange = computed(() =>
  buildDateChangeSummary(props.oldStartDate, props.startDate),
);
const endChange = computed(() =>
  buildDateChangeSummary(props.oldEndDate, props.endDate),
);

const candidateRows = computed(() => buildCandidateRows(state.value.candidates));

const selectedOps = computed(() =>
  selectedOperations(state.value.candidates, state.value.selection),
);

const selectedRows = computed(() => buildCandidateRows(selectedOps.value));

const showDestructiveWarning = computed(() =>
  hasDestructiveOperations(selectedOps.value),
);

const tagClass: Record<string, string> = {
  add: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  regen: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  del: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
};

function dispatch(
  action: Parameters<typeof reduceConfirm>[1],
) {
  state.value = reduceConfirm(state.value, action);
}

function onClose() {
  dispatch({ type: "dismiss" });
}
</script>

<template>
  <Modal
    :open="open"
    :ariaLabel="title"
    @close="onClose"
  >
    <template #title>{{ title }}</template>

    <div v-if="state.screen === 'A'" class="space-y-3 text-sm text-slate-700">
      <p>{{ missingBody }}</p>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <dt class="text-slate-500">開始日</dt>
        <dd :class="startSummary.unset ? 'font-medium text-amber-700' : 'text-slate-800'">
          {{ startSummary.text }}
        </dd>
        <dt class="text-slate-500">終了日</dt>
        <dd :class="endSummary.unset ? 'font-medium text-amber-700' : 'text-slate-800'">
          {{ endSummary.text }}
        </dd>
      </dl>
      <p class="text-xs text-slate-500">
        あとから日付を設定すると、テンプレートタスクの追加・付け替えができます。
      </p>
    </div>

    <div v-else-if="state.screen === 'B'" class="space-y-3 text-sm text-slate-700">
      <div class="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p class="text-xs font-medium text-slate-500">日付の変更</p>
        <p data-testid="date-change-start">
          開始日
          <template v-if="startChange.changed">
            <span
              class="ml-1"
              :class="startChange.oldUnset ? 'text-amber-700' : 'text-slate-500 line-through'"
            >{{ startChange.oldText }}</span>
            <span class="mx-1 text-slate-400">→</span>
            <span :class="startChange.newUnset ? 'font-medium text-amber-700' : 'font-medium text-slate-800'">
              {{ startChange.newText }}
            </span>
          </template>
          <span
            v-else
            class="ml-1"
            :class="startChange.newUnset ? 'font-medium text-amber-700' : 'font-medium text-slate-800'"
          >{{ startChange.newText }}</span>
        </p>
        <p data-testid="date-change-end">
          終了日
          <template v-if="endChange.changed">
            <span
              class="ml-1"
              :class="endChange.oldUnset ? 'text-amber-700' : 'text-slate-500 line-through'"
            >{{ endChange.oldText }}</span>
            <span class="mx-1 text-slate-400">→</span>
            <span :class="endChange.newUnset ? 'font-medium text-amber-700' : 'font-medium text-slate-800'">
              {{ endChange.newText }}
            </span>
          </template>
          <span
            v-else
            class="ml-1"
            :class="endChange.newUnset ? 'font-medium text-amber-700' : 'font-medium text-slate-800'"
          >{{ endChange.newText }}</span>
        </p>
      </div>

      <ul class="max-h-64 space-y-2 overflow-y-auto py-0.5">
        <li
          v-for="row in candidateRows"
          :key="row.operation"
          class="flex cursor-pointer items-start gap-2 rounded-xl border-2 bg-white px-3 py-2.5 transition-colors"
          :class="
            state.selection[row.operation]
              ? 'border-indigo-500'
              : 'border-slate-200 hover:border-slate-300'
          "
          @click="dispatch({ type: 'toggle', operation: row.operation })"
        >
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            :checked="state.selection[row.operation]"
            :aria-label="row.title"
            @click.prevent.stop="dispatch({ type: 'toggle', operation: row.operation })"
          />
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium"
                :class="tagClass[row.tagKind]"
              >{{ row.tag }}</span>
              <span class="text-sm font-medium text-slate-900">{{ row.title }}</span>
            </div>
            <p class="text-xs text-slate-500">{{ row.note }}</p>
          </div>
        </li>
      </ul>

      <p class="text-xs text-slate-500">
        チェックを外した候補は適用せず、日付の変更のみ保存します。手動作成タスクは対象外です。完了済みのテンプレートタスクも削除・生成し直しの対象に含まれます。
      </p>
    </div>

    <div v-else class="space-y-3 text-sm text-slate-700">
      <ul v-if="selectedRows.length > 0" class="space-y-2">
        <li
          v-for="row in selectedRows"
          :key="row.operation"
          class="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2"
        >
          <span
            class="inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium"
            :class="tagClass[row.tagKind]"
          >{{ row.tag }}</span>
          <span class="text-sm text-slate-800">{{ row.title }}</span>
        </li>
      </ul>
      <p v-else class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
        テンプレートタスクへの操作はありません。案件の日付変更のみ保存します。
      </p>

      <p class="text-sm text-slate-700">あわせて案件の開始日・終了日を保存します。</p>

      <div
        v-if="showDestructiveWarning"
        class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        role="alert"
      >
        削除または生成し直しを含みます。対象のテンプレートタスク（完了済みを含む）が置き換わるか削除されます。手動作成タスクは対象外です。
      </div>
    </div>

    <template #actions>
      <div class="flex w-full items-center justify-end gap-2">
        <!-- Screen A -->
        <template v-if="state.screen === 'A'">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="dispatch({ type: 'secondary' })"
          >
            戻る
          </button>
          <button
            type="button"
            class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            @click="dispatch({ type: 'primary' })"
          >
            作成する
          </button>
        </template>

        <!-- Screen B -->
        <template v-else-if="state.screen === 'B'">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="dispatch({ type: 'secondary' })"
          >
            キャンセル
          </button>
          <button
            type="button"
            class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            @click="dispatch({ type: 'primary' })"
          >
            次へ
          </button>
        </template>

        <!-- Screen C -->
        <template v-else>
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="dispatch({ type: 'secondary' })"
          >
            戻る
          </button>
          <button
            type="button"
            class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            @click="dispatch({ type: 'primary' })"
          >
            実行する
          </button>
        </template>
      </div>
    </template>
  </Modal>
</template>
