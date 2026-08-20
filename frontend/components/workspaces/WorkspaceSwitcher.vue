<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useCurrentWorkspace } from "../../composables/useCurrentWorkspace";
import type { Workspace } from "../../composables/useApiClient";
import {
  replaceWorkspaceIdInPath,
  workspacePath,
} from "../../utils/workspacePath";

const route = useRoute();
const { workspaces, currentId, refresh, select } = useCurrentWorkspace();

const open = ref(false);
const createOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const currentWorkspace = computed<Workspace | null>(() => {
  const id = currentId.value;
  if (!id) return null;
  return workspaces.value.find((w) => w.id === id) ?? null;
});

const isEmpty = computed(() => currentWorkspace.value === null);

const triggerLabel = computed(() =>
  currentWorkspace.value ? currentWorkspace.value.name : "ワークスペース未選択",
);

const triggerColor = computed(() => currentWorkspace.value?.color ?? null);

onMounted(() => {
  void refresh();
  document.addEventListener("click", onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
});

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return;
  const root = rootRef.value;
  if (root && !root.contains(event.target as Node)) {
    open.value = false;
  }
}

function toggle() {
  open.value = !open.value;
}

function choose(id: string) {
  select(id);
  open.value = false;

  const replaced = replaceWorkspaceIdInPath(route.path, id);
  if (replaced) {
    void navigateTo({ path: replaced, query: route.query });
    return;
  }
  if (route.path === "/") {
    void navigateTo(workspacePath(id, ""));
  }
}

function openCreate() {
  open.value = false;
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

function closeDropdown() {
  open.value = false;
}
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      data-testid="workspace-switcher-trigger"
      class="inline-flex max-w-[9rem] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-slate-50 sm:max-w-none"
      :class="isEmpty ? 'text-slate-400' : 'text-slate-700'"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
    >
      <span
        data-testid="workspace-color-dot"
        class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        :class="isEmpty ? 'bg-slate-300' : ''"
        :style="triggerColor ? { backgroundColor: triggerColor } : undefined"
      />
      <span class="truncate">{{ triggerLabel }}</span>
      <span class="shrink-0 text-xs text-slate-400" aria-hidden="true">▼</span>
    </button>

    <div
      v-if="open"
      role="listbox"
      aria-label="ワークスペース"
      class="absolute right-0 z-50 mt-1 w-64 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
    >
      <div class="px-3 py-1.5 text-xs font-medium text-slate-500">ワークスペース</div>

      <button
        v-for="workspace in workspaces"
        :key="workspace.id"
        type="button"
        role="option"
        :aria-selected="workspace.id === currentId"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        @click="choose(workspace.id)"
      >
        <span
          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: workspace.color }"
        />
        <span class="min-w-0 flex-1 truncate">{{ workspace.name }}</span>
        <span
          v-if="workspace.id === currentId"
          class="shrink-0 text-slate-500"
          aria-hidden="true"
        >✓</span>
      </button>

      <div class="my-1 border-t border-slate-100" />

      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        @click="openCreate"
      >
        ＋ ワークスペースを作成
      </button>
      <NuxtLink
        to="/workspaces"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        @click="closeDropdown"
      >
        ワークスペースを管理
      </NuxtLink>
    </div>

    <WorkspaceCreateModal :open="createOpen" @close="closeCreate" />
  </div>
</template>
