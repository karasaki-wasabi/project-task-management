<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useInlineEditableFieldSelection } from "./inlineEditableFieldSelection";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: unknown;
    editable?: boolean;
    onSave: (value: unknown) => Promise<void>;
  }>(),
  {
    editable: true,
  },
);

const emit = defineEmits<{
  saved: [value: unknown];
}>();

const selection = useInlineEditableFieldSelection();
const selectionId = Symbol("inline-editable-field");
const hovered = ref(false);
const selected = computed(() => selection.selectedId.value === selectionId);
const editing = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const originalValue = ref<unknown>(props.modelValue);
const draftValue = ref<unknown>(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    if (!editing.value) {
      originalValue.value = value;
      draftValue.value = value;
    }
  },
);

function selectRow() {
  if (props.editable && !editing.value) selection.selectedId.value = selectionId;
}

function openPicker() {
  if (!props.editable) return;
  selection.selectedId.value = selectionId;
  originalValue.value = props.modelValue;
  draftValue.value = props.modelValue;
  error.value = null;
  editing.value = true;
}

function setDraftValue(value: unknown) {
  draftValue.value = value;
}

function cancel() {
  draftValue.value = originalValue.value;
  error.value = null;
  editing.value = false;
  if (selected.value) selection.selectedId.value = null;
}

async function save() {
  if (saving.value) return;
  error.value = null;
  saving.value = true;
  try {
    await props.onSave(draftValue.value);
    emit("saved", draftValue.value);
    editing.value = false;
    if (selected.value) selection.selectedId.value = null;
  } catch (caught) {
    draftValue.value = originalValue.value;
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

onUnmounted(() => {
  if (selected.value) selection.selectedId.value = null;
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && editing.value) {
    event.preventDefault();
    cancel();
  } else if ((event.key === "Enter" || event.key === " ") && !editing.value) {
    event.preventDefault();
    selectRow();
  }
}
</script>

<template>
  <div class="relative" @keydown="onKeydown">
    <div
      data-testid="inline-editable-row"
      class="group flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
      :class="selected && editable ? 'bg-primary-50' : 'hover:bg-slate-50'"
      :tabindex="editable ? 0 : undefined"
      :aria-label="editable ? `${label}の行。選択すると編集操作を表示します` : undefined"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @click="selectRow"
    >
      <div class="min-w-0 flex-1">
        <slot :value="editing ? originalValue : modelValue" />
      </div>

      <button
        v-if="editable"
        type="button"
        class="shrink-0 rounded p-1 text-slate-500 transition-opacity hover:bg-white hover:text-primary-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :class="hovered || selected || editing ? 'opacity-100' : 'pointer-events-none opacity-0'"
        :aria-label="`${label}を編集`"
        :aria-hidden="hovered || selected || editing ? undefined : 'true'"
        :tabindex="hovered || selected || editing ? 0 : -1"
        @click.stop="openPicker"
      >
        <span aria-hidden="true">✎</span>
      </button>
    </div>

    <div
      v-if="editing"
      class="mt-1 rounded-md border border-slate-200 bg-white p-3 shadow-sm"
      data-testid="inline-editable-picker"
    >
      <p
        v-if="error"
        role="alert"
        class="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ error }}
      </p>
      <slot
        name="picker"
        :draftValue="draftValue"
        :setDraftValue="setDraftValue"
        :save="save"
        :cancel="cancel"
        :saving="saving"
      />
    </div>
  </div>
</template>
