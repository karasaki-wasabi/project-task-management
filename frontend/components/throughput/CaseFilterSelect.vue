<!--
  Searchable case filter for the throughput dashboard (velocity-dashboard 4.3).
  Filters out completed cases client-side; leading "全体(ワークスペース)" clears
  selection (null). Requirements 4.2, 4.3, 4.4, 7.6.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Case } from "../../composables/useApiClient";

const props = defineProps<{
  cases: Case[];
  modelValue: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const ALL_LABEL = "全体(ワークスペース)";

const open = ref(false);
const search = ref("");
const rootEl = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);

const activeCases = computed(() => props.cases.filter((c) => !c.isCompleted));

const filteredCases = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return activeCases.value;
  return activeCases.value.filter((c) => c.name.toLowerCase().includes(q));
});

const selectedLabel = computed(() => {
  if (props.modelValue === null) return ALL_LABEL;
  return activeCases.value.find((c) => c.id === props.modelValue)?.name ?? ALL_LABEL;
});

function optionClass(selected: boolean): string {
  const base =
    "flex w-full items-center px-3 py-2 text-left text-sm focus-visible:outline-none";
  if (selected) {
    return `${base} bg-blue-50 text-blue-800 hover:bg-blue-100 focus-visible:bg-blue-100`;
  }
  return `${base} text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50`;
}

async function openDropdown() {
  open.value = true;
  search.value = "";
  await nextTick();
  searchInput.value?.focus();
}

function closeDropdown() {
  open.value = false;
  search.value = "";
}

function toggleDropdown() {
  if (open.value) {
    closeDropdown();
  } else {
    void openDropdown();
  }
}

function selectAll() {
  emit("update:modelValue", null);
  closeDropdown();
}

function selectCase(caseItem: Case) {
  emit("update:modelValue", caseItem.id);
  closeDropdown();
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value || !rootEl.value) return;
  if (!rootEl.value.contains(event.target as Node)) {
    closeDropdown();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    closeDropdown();
  }
}

watch(
  () => props.modelValue,
  () => {
    if (open.value) closeDropdown();
  },
);

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="rootEl" class="relative inline-flex flex-col gap-1">
    <label class="text-sm leading-5 text-slate-700" for="case-filter-trigger">
      案件で絞り込み
    </label>
    <button
      id="case-filter-trigger"
      data-testid="case-filter-trigger"
      type="button"
      class="flex h-10 min-w-[16rem] items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleDropdown"
    >
      <span class="min-w-0 flex-1 truncate">{{ selectedLabel }}</span>
      <span aria-hidden="true" class="shrink-0 text-slate-400">▾</span>
    </button>

    <div
      v-if="open"
      class="absolute left-0 top-full z-20 mt-1 w-full min-w-[16rem] rounded-md border border-slate-200 bg-white shadow-sm"
    >
      <div class="border-b border-slate-100 p-2">
        <input
          ref="searchInput"
          data-testid="case-filter-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="case-filter-options"
          :aria-expanded="open"
          placeholder="案件名で検索"
          class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          :value="search"
          @input="search = ($event.target as HTMLInputElement).value"
        >
      </div>

      <div
        id="case-filter-options"
        role="listbox"
        aria-label="案件候補"
        class="max-h-56 overflow-y-auto py-1"
      >
        <button
          type="button"
          role="option"
          :aria-selected="modelValue === null"
          :class="optionClass(modelValue === null)"
          @click="selectAll"
        >
          {{ ALL_LABEL }}
        </button>
        <button
          v-for="caseItem in filteredCases"
          :key="caseItem.id"
          type="button"
          role="option"
          :aria-selected="caseItem.id === modelValue"
          :class="optionClass(caseItem.id === modelValue)"
          @click="selectCase(caseItem)"
        >
          {{ caseItem.name }}
        </button>
        <p
          v-if="filteredCases.length === 0"
          class="px-3 py-2 text-sm text-slate-500"
        >
          候補がありません
        </p>
      </div>

      <p class="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        完了済みの案件は表示されません
      </p>
    </div>
  </div>
</template>
