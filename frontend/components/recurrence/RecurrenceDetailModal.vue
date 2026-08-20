<script setup lang="ts">
import {
  formatOffsetLabel,
  nonBusinessDayPolicyLabel,
  priorityLabel,
} from "./recurrenceLabels";

const props = defineProps<{ templateId: string | null }>();
const emit = defineEmits<{
  close: [];
  updated: [template: RecurringTaskTemplate];
  deleted: [template: { id: string; title: string }];
}>();

const api = useApiClient();
const isOpen = computed(() => props.templateId !== null);

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const confirmingDelete = ref(false);
const template = ref<RecurringTaskTemplate | null>(null);

const statusBadge = computed(() => {
  if (!template.value) return null;
  return template.value.isActive
    ? { tone: "success" as const, label: "有効" }
    : { tone: "neutral" as const, label: "停止中" };
});

const offsetLabel = computed(() => {
  if (!template.value) return "";
  return formatOffsetLabel(template.value.caseAnchor, template.value.caseOffsetDays);
});

watch(
  () => props.templateId,
  async (id) => {
    error.value = null;
    confirmingDelete.value = false;
    template.value = null;
    if (!id) return;
    loading.value = true;
    try {
      const list = await api.listRecurringTemplates();
      const loaded = list.find((item) => item.id === id);
      if (!loaded) {
        throw new Error("テンプレートが見つかりません。一覧を再読み込みしてください。");
      }
      template.value = loaded;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

async function toggleActive() {
  if (!props.templateId || !template.value || saving.value) return;
  error.value = null;
  saving.value = true;
  const nextActive = !template.value.isActive;
  try {
    if (nextActive) {
      await api.resumeRecurringTemplate(props.templateId);
    } else {
      await api.stopRecurringTemplate(props.templateId);
    }
    template.value = { ...template.value, isActive: nextActive };
    emit("updated", template.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function confirmDelete() {
  if (!props.templateId || !template.value) return;
  error.value = null;
  saving.value = true;
  try {
    await api.deleteRecurringTemplate(props.templateId);
    emit("deleted", { id: props.templateId, title: template.value.title });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    confirmingDelete.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal class="recurrence-detail-modal" :open="isOpen" ariaLabel="テンプレートの詳細" @close="emit('close')">
    <template #title>{{ template ? template.title : "読み込み中…" }}</template>

    <ErrorAlert v-if="error" :message="error" />

    <p v-if="loading" class="text-sm text-slate-500">読み込み中…</p>

    <template v-else-if="template">
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            data-testid="active-toggle"
            :aria-checked="template.isActive"
            :aria-label="template.isActive ? 'テンプレートを停止する' : 'テンプレートを再開する'"
            :disabled="saving"
            class="toggle-switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :class="template.isActive ? 'bg-primary-600' : 'bg-slate-300'"
            @click="toggleActive"
          >
            <span
              class="toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="template.isActive ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </button>
          <Badge v-if="statusBadge" :tone="statusBadge.tone" :label="statusBadge.label" />
        </div>

        <div class="space-y-3 text-sm">
          <div class="grid grid-cols-[9rem_1fr] items-baseline gap-3">
            <span class="text-xs font-medium text-slate-500">オフセット</span>
            <span class="text-slate-900">{{ offsetLabel }}</span>
          </div>
          <div class="grid grid-cols-[9rem_1fr] items-baseline gap-3">
            <span class="text-xs font-medium text-slate-500">非営業日の扱い</span>
            <span class="text-slate-900">{{ nonBusinessDayPolicyLabel(template.nonBusinessDayPolicy) }}</span>
          </div>
          <div class="grid grid-cols-[9rem_1fr] items-baseline gap-3">
            <span class="text-xs font-medium text-slate-500">優先度</span>
            <span class="text-slate-900">{{ priorityLabel(template.priority) }}</span>
          </div>
          <div class="grid grid-cols-[9rem_1fr] items-baseline gap-3">
            <span class="text-xs font-medium text-slate-500">既定詳細</span>
            <span class="text-slate-700">{{ template.defaultDetail?.trim() ? template.defaultDetail : "—" }}</span>
          </div>
        </div>
      </div>
    </template>

    <template v-if="template" #actions>
      <div v-if="!confirmingDelete" class="flex w-full items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="emit('close')"
        >
          閉じる
        </button>
        <button
          type="button"
          class="ml-auto rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          @click="confirmingDelete = true"
        >
          削除
        </button>
      </div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-red-700">本当に削除しますか?</span>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="confirmingDelete = false"
        >
          キャンセル
        </button>
        <button
          type="button"
          :disabled="saving"
          class="ml-auto rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="confirmDelete"
        >
          削除する
        </button>
      </div>
    </template>
  </Modal>
</template>
