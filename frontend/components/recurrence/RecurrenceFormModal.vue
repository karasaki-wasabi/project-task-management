<!--
  Case-relative recurring template create modal (task 7.1,
  research.md「ビジュアルデザイン確定」, Requirements 1.3, 2.1–2.5, 8.2, 8.3).
  Create-only — mirrors CaseFormModal. No fixed_interval fields; offset is
  non-negative with direction fixed per caseAnchor.

  Explicit Vue / useApiClient imports so vitest can mount without Nuxt
  auto-import runtime (same approach as CaseFormModal.vue).
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import {
  useApiClient,
  type CaseRelativeAnchor,
  type NonBusinessDayPolicy,
  type Priority,
  type RecurringTaskTemplate,
} from "../../composables/useApiClient";
import { buildRegisterTemplateInput, validateRecurrenceForm } from "./RecurrenceFormModal.helpers";
import {
  CASE_ANCHOR_OPTIONS,
  NON_BUSINESS_DAY_POLICY_OPTIONS,
  PRIORITY_OPTIONS,
  offsetDirectionHint,
} from "./recurrenceLabels";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [template: RecurringTaskTemplate] }>();

const api = useApiClient();

const title = ref("");
const priority = ref<Priority>("medium");
const caseAnchor = ref<CaseRelativeAnchor>("case_end");
const caseOffsetDays = ref(0);
const nonBusinessDayPolicy = ref<NonBusinessDayPolicy>("as_is");
const defaultMemo = ref("");

const saving = ref(false);
const error = ref<string | null>(null);

function resetForm() {
  title.value = "";
  priority.value = "medium";
  caseAnchor.value = "case_end";
  caseOffsetDays.value = 0;
  nonBusinessDayPolicy.value = "as_is";
  defaultMemo.value = "";
  error.value = null;
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    resetForm();
  },
  { immediate: true },
);

async function submit() {
  error.value = null;
  const fields = {
    title: title.value,
    priority: priority.value,
    caseAnchor: caseAnchor.value,
    caseOffsetDays: Number(caseOffsetDays.value),
    nonBusinessDayPolicy: nonBusinessDayPolicy.value,
    defaultMemo: defaultMemo.value,
  };
  const validation = validateRecurrenceForm(fields);
  if (!validation.valid) {
    error.value = validation.error ?? "入力内容を確認してください";
    return;
  }

  saving.value = true;
  try {
    const created = await api.registerRecurringTemplate(buildRegisterTemplateInput(fields));
    emit("created", created);
    emit("close");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal class="recurrence-form-modal" :open="open" aria-label="案件連動テンプレートの登録" @close="emit('close')">
    <template #title>案件連動テンプレートを登録</template>

    <ErrorAlert v-if="error" :message="error" />

    <form id="recurrence-form" class="space-y-3" @submit.prevent="submit">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500" for="recurrence-form-title">テンプレート名</label>
        <input
          id="recurrence-form-title"
          v-model="title"
          required
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-slate-500" for="recurrence-form-priority">優先度</label>
          <select
            id="recurrence-form-priority"
            v-model="priority"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-slate-500" for="recurrence-form-case-anchor">起点</label>
          <select
            id="recurrence-form-case-anchor"
            v-model="caseAnchor"
            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option v-for="opt in CASE_ANCHOR_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-slate-500" for="recurrence-form-offset">オフセット日数</label>
          <input
            id="recurrence-form-offset"
            v-model.number="caseOffsetDays"
            type="number"
            min="0"
            step="1"
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <p class="text-xs text-slate-400">{{ offsetDirectionHint(caseAnchor) }}</p>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500" for="recurrence-form-policy">非営業日に該当した場合の扱い</label>
        <select
          id="recurrence-form-policy"
          v-model="nonBusinessDayPolicy"
          class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option v-for="opt in NON_BUSINESS_DAY_POLICY_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500" for="recurrence-form-memo">既定メモ(全インスタンス共通・任意)</label>
        <input
          id="recurrence-form-memo"
          v-model="defaultMemo"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
    </form>

    <template #actions>
      <div class="flex items-center gap-2">
        <button
          type="submit"
          form="recurrence-form"
          :disabled="saving || !title.trim()"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          登録
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="emit('close')"
        >
          キャンセル
        </button>
      </div>
    </template>
  </Modal>
</template>
