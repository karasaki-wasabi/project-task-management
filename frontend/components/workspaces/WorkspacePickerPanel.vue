<script setup lang="ts">
const { workspaces } = useCurrentWorkspace();
const createOpen = ref(false);

const isEmpty = computed(() => workspaces.value.length === 0);

function openCreate() {
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

function onCreated() {
  createOpen.value = false;
}

function choose(workspaceId: string) {
  void navigateTo(workspacePath(workspaceId, ""));
}
</script>

<template>
  <div data-testid="workspace-picker-panel" class="space-y-5">
    <div
      v-if="isEmpty"
      data-testid="workspace-empty-state"
      class="rounded-lg bg-white p-8 text-center ring-1 ring-slate-200"
    >
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">ワークスペースがありません</h1>
      <p class="mt-2 text-sm text-slate-600">
        最初のワークスペースを作成すると、メンバーを追加して共有の可視境界を持てます。
      </p>
      <button
        type="button"
        class="mt-5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
        @click="openCreate"
      >
        ワークスペースを作成
      </button>
    </div>

    <div v-else class="rounded-lg bg-white p-6 ring-1 ring-slate-200">
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">ワークスペースを選択</h1>
      <p class="mt-2 text-sm text-slate-600">
        利用するワークスペースを選ぶか、新しく作成してください。
      </p>
      <ul class="mt-4 divide-y divide-slate-100" role="list">
        <li v-for="workspace in workspaces" :key="workspace.id">
          <button
            type="button"
            data-testid="workspace-picker-item"
            class="flex w-full items-center gap-2 rounded-md px-2 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
            @click="choose(workspace.id)"
          >
            <span
              class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: workspace.color }"
            />
            <span class="min-w-0 flex-1 truncate font-medium text-slate-900">{{
              workspace.name
            }}</span>
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="mt-4 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
        @click="openCreate"
      >
        ワークスペースを作成
      </button>
    </div>

    <WorkspaceCreateModal :open="createOpen" @close="closeCreate" @created="onCreated" />
  </div>
</template>
