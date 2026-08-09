<!--
  Workspaces / member management page (task 6.3, design.md pages/workspaces,
  Requirements 2.3, 3.1, 3.2). Empty state when no current workspace
  (create CTA → WorkspaceCreateModal); otherwise color-dot heading +
  member list (name / email). Settings / add-member shells are present
  for later tasks 6.4–6.5; search/settings/delete behavior is out of scope.

  Explicit Vue / composable imports so vitest can mount without Nuxt
  auto-import runtime (same approach as WorkspaceCreateModal.vue).
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useApiClient, type WorkspaceUserSummary } from "../../composables/useApiClient";
import { useCurrentWorkspace } from "../../composables/useCurrentWorkspace";
import { findCurrentWorkspace, formatMemberCount, resolvePageView } from "./index.helpers";

const api = useApiClient();
const { workspaces, currentId, refresh } = useCurrentWorkspace();

const members = ref<WorkspaceUserSummary[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);
const createOpen = ref(false);
let loadSeq = 0;

const pageView = computed(() => resolvePageView(currentId.value));
const currentWorkspace = computed(() => findCurrentWorkspace(workspaces.value, currentId.value));
const memberCountLabel = computed(() => formatMemberCount(members.value.length));

async function loadMembers(workspaceId: string) {
  const seq = ++loadSeq;
  error.value = null;
  loaded.value = false;
  try {
    const list = await api.listWorkspaceMembers(workspaceId);
    if (seq !== loadSeq) return;
    members.value = list;
  } catch (e) {
    if (seq !== loadSeq) return;
    members.value = [];
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (seq === loadSeq) {
      loaded.value = true;
    }
  }
}

async function bootstrap() {
  error.value = null;
  try {
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    loaded.value = true;
  }
}

onMounted(() => {
  void bootstrap();
});

watch(
  currentId,
  (id) => {
    if (id === null) {
      members.value = [];
      loaded.value = true;
      return;
    }
    void loadMembers(id);
  },
  { immediate: true },
);

function openCreate() {
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

async function onCreated() {
  // WorkspaceCreateModal already refresh()+select(); watch(currentId) reloads members.
  createOpen.value = false;
}
</script>

<template>
  <div class="space-y-5">
    <div
      v-if="pageView === 'empty'"
      data-testid="workspace-empty-state"
      class="rounded-lg bg-white p-8 text-center ring-1 ring-slate-200"
    >
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">ワークスペースがありません</h1>
      <p class="mt-2 text-sm text-slate-600">
        最初のワークスペースを作成すると、メンバーを招待して案件やタスクを共有できます。
      </p>
      <button
        type="button"
        class="mt-5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
        @click="openCreate"
      >
        ワークスペースを作成
      </button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div data-testid="workspace-heading" class="min-w-0">
          <p class="text-xs font-medium text-slate-500">ワークスペース</p>
          <div class="mt-1 flex items-center gap-2">
            <span
              data-testid="workspace-color-dot"
              class="inline-block h-3 w-3 shrink-0 rounded-full"
              :style="currentWorkspace ? { backgroundColor: currentWorkspace.color } : undefined"
            />
            <h1 class="truncate text-xl font-semibold tracking-tight text-slate-900">
              {{ currentWorkspace?.name ?? "" }}
            </h1>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            設定
          </button>
          <button
            type="button"
            class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
          >
            メンバーを追加
          </button>
        </div>
      </div>

      <ErrorAlert v-if="error" :message="error" />

      <div v-if="loaded" class="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th class="px-3 py-2 font-medium">表示名</th>
              <th class="px-3 py-2 font-medium">メールアドレス</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in members"
              :key="member.userId"
              class="border-b border-slate-100 last:border-0"
            >
              <td data-testid="member-name" class="px-3 py-2 font-medium text-slate-900">
                {{ member.name }}
              </td>
              <td data-testid="member-email" class="px-3 py-2 text-slate-600">
                {{ member.email }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          {{ memberCountLabel }}
        </p>
      </div>
    </template>

    <WorkspaceCreateModal :open="createOpen" @close="closeCreate" @created="onCreated" />
  </div>
</template>
