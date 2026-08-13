<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useApiClient, type Task } from "../../composables/useApiClient";

const props = defineProps<{
  taskId: string;
  modelValue: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const api = useApiClient();
const search = ref("");
const candidates = ref<Task[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let requestSequence = 0;

async function loadCandidates(titleContains: string) {
  const sequence = ++requestSequence;
  loading.value = true;
  error.value = null;

  try {
    const tasks = await api.listTasks({
      titleContains,
      excludeSubtreeOf: props.taskId,
      excludeClosed: true,
    });
    if (sequence !== requestSequence) return;

    candidates.value = tasks;
    if (!search.value && props.modelValue) {
      search.value = tasks.find((task) => task.id === props.modelValue)?.title ?? "";
    }
  } catch (caught) {
    if (sequence !== requestSequence) return;
    candidates.value = [];
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function onSearchInput(event: Event) {
  search.value = (event.target as HTMLInputElement).value;
  void loadCandidates(search.value);
}

function selectTask(task: Task) {
  search.value = task.title;
  emit("update:modelValue", task.id);
}

function clearSelection() {
  search.value = "";
  emit("update:modelValue", null);
  void loadCandidates("");
}

watch(
  () => props.taskId,
  () => {
    search.value = "";
    void loadCandidates("");
  },
);

watch(
  () => props.modelValue,
  (value) => {
    if (value === null) {
      search.value = "";
      return;
    }
    const selected = candidates.value.find((task) => task.id === value);
    if (selected) search.value = selected.title;
  },
);

onMounted(() => {
  void loadCandidates("");
});
</script>

<template>
  <div class="space-y-2">
    <div class="relative">
      <label for="parent-task-search" class="mb-1 block text-sm font-medium text-slate-700">
        親タスク
      </label>
      <div class="flex gap-2">
        <div class="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"
          >
            ⌕
          </span>
          <input
            id="parent-task-search"
            :value="search"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="parent-task-options"
            aria-expanded="true"
            placeholder="タイトルで検索"
            class="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            @input="onSearchInput"
          >
        </div>
        <button
          type="button"
          aria-label="親タスクを解除する"
          class="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          @click="clearSelection"
        >
          親タスクを解除する
        </button>
      </div>
    </div>

    <p
      v-if="error"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <div
      id="parent-task-options"
      role="listbox"
      aria-label="親タスク候補"
      class="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-sm"
    >
      <p v-if="loading" class="px-3 py-2 text-sm text-slate-500">検索中...</p>
      <p
        v-else-if="!error && candidates.length === 0"
        class="px-3 py-2 text-sm text-slate-500"
      >
        候補がありません
      </p>
      <button
        v-for="task in candidates"
        v-else
        :key="task.id"
        type="button"
        role="option"
        :aria-selected="task.id === modelValue"
        class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-primary-50 focus-visible:bg-primary-50 focus-visible:outline-none"
        :class="task.id === modelValue ? 'bg-primary-50 text-primary-800' : ''"
        @click="selectTask(task)"
      >
        <span class="min-w-0 flex-1 truncate">{{ task.title }}</span>
        <span
          v-if="task.id === modelValue"
          aria-hidden="true"
          class="shrink-0 text-primary-600"
        >
          ✓
        </span>
      </button>
    </div>
  </div>
</template>
