<!--
  Workspaces / member management page (tasks 6.3–6.6, design.md pages/workspaces,
  Requirements 2.3, 3.1, 3.2, 4.1–4.5, 6.1–6.3, 7.1–7.4). Empty state when no
  current workspace (create CTA → WorkspaceCreateModal); otherwise color-dot
  heading + member list + inline expandable search panel + settings modal +
  creator-only delete with Modal confirmation.

  Explicit Vue / composable imports so vitest can mount without Nuxt
  auto-import runtime (same approach as WorkspaceCreateModal.vue).
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import UserAvatar from "../../components/shared/UserAvatar.vue";
import { useApiClient, type WorkspaceUserSummary } from "../../composables/useApiClient";
import { useAuth } from "../../composables/useAuth";
import { useCurrentWorkspace } from "../../composables/useCurrentWorkspace";
import {
  findCurrentWorkspace,
  formatMemberCount,
  isWorkspaceCreator,
  normalizeMemberSearchQuery,
  resolvePageView,
  shouldRunMemberSearch,
  shouldShowMemberSearchEmpty,
} from "./index.helpers";

const api = useApiClient();
const { user } = useAuth();
const { workspaces, currentId, refresh, clearCurrentIf, relocateAfterWorkspaceLost } =
  useCurrentWorkspace();

const members = ref<WorkspaceUserSummary[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);
const createOpen = ref(false);
const settingsOpen = ref(false);
const deleteConfirmOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
let loadSeq = 0;

const addPanelOpen = ref(false);
const searchQuery = ref("");
const searchResults = ref<WorkspaceUserSummary[]>([]);
const searchLoading = ref(false);
const searchSearched = ref(false);
const searchError = ref<string | null>(null);
const addingUserId = ref<string | null>(null);
let searchSeq = 0;

const pageView = computed(() => resolvePageView(currentId.value));
const currentWorkspace = computed(() => findCurrentWorkspace(workspaces.value, currentId.value));
const memberCountLabel = computed(() => formatMemberCount(members.value.length));
const showDeleteButton = computed(() =>
  isWorkspaceCreator(currentWorkspace.value, user.value?.id),
);
const showSearchEmpty = computed(() =>
  shouldShowMemberSearchEmpty({
    searched: searchSearched.value,
    loading: searchLoading.value,
    resultCount: searchResults.value.length,
  }),
);

function resetSearchPanel() {
  searchSeq += 1;
  searchQuery.value = "";
  searchResults.value = [];
  searchLoading.value = false;
  searchSearched.value = false;
  searchError.value = null;
  addingUserId.value = null;
}

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

async function runMemberSearch(workspaceId: string, rawQuery: string) {
  const q = normalizeMemberSearchQuery(rawQuery);
  if (!shouldRunMemberSearch(q)) {
    searchSeq += 1;
    searchResults.value = [];
    searchLoading.value = false;
    searchSearched.value = false;
    searchError.value = null;
    return;
  }

  const seq = ++searchSeq;
  searchLoading.value = true;
  searchError.value = null;
  try {
    const list = await api.searchAddableWorkspaceUsers(workspaceId, q);
    if (seq !== searchSeq) return;
    searchResults.value = list;
    searchSearched.value = true;
  } catch (e) {
    if (seq !== searchSeq) return;
    searchResults.value = [];
    searchSearched.value = true;
    searchError.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (seq === searchSeq) {
      searchLoading.value = false;
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
    addPanelOpen.value = false;
    resetSearchPanel();
    deleteConfirmOpen.value = false;
    deleteError.value = null;
    if (id === null) {
      members.value = [];
      loaded.value = true;
      return;
    }
    void loadMembers(id);
  },
  { immediate: true },
);

watch(searchQuery, (query) => {
  const workspaceId = currentId.value;
  if (!addPanelOpen.value || workspaceId === null) return;
  void runMemberSearch(workspaceId, query);
});

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

function openSettings() {
  settingsOpen.value = true;
}

function closeSettings() {
  settingsOpen.value = false;
}

function onSettingsSaved() {
  // WorkspaceSettingsModal already updateWorkspace()+refresh(); heading reacts to workspaces.
  settingsOpen.value = false;
}

function toggleAddPanel() {
  addPanelOpen.value = !addPanelOpen.value;
  if (!addPanelOpen.value) {
    resetSearchPanel();
  }
}

async function onAddMember(userId: string) {
  const workspaceId = currentId.value;
  if (workspaceId === null || addingUserId.value !== null) return;

  addingUserId.value = userId;
  searchError.value = null;
  try {
    await api.addWorkspaceMember(workspaceId, userId);
    await loadMembers(workspaceId);
    // Re-run the same query so the API excludes the newly added member (Req 4.2).
    await runMemberSearch(workspaceId, searchQuery.value);
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : String(e);
  } finally {
    addingUserId.value = null;
  }
}

function openDeleteConfirm() {
  if (!showDeleteButton.value) return;
  deleteError.value = null;
  deleteConfirmOpen.value = true;
}

function closeDeleteConfirm() {
  if (deleting.value) return;
  deleteConfirmOpen.value = false;
  deleteError.value = null;
}

async function confirmDelete() {
  const workspace = currentWorkspace.value;
  if (workspace === null || deleting.value || !showDeleteButton.value) return;

  deleting.value = true;
  deleteError.value = null;
  try {
    const deletedId = workspace.id;
    await api.deleteWorkspace(deletedId);
    // Requirement 7.4 / workspace-url-routing 5.1: clear then relocate away from lost WS.
    clearCurrentIf(deletedId);
    await refresh();
    deleteConfirmOpen.value = false;
    relocateAfterWorkspaceLost(deletedId);
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : String(e);
  } finally {
    deleting.value = false;
  }
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
            @click="openSettings"
          >
            設定
          </button>
          <button
            type="button"
            class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
            @click="toggleAddPanel"
          >
            メンバーを追加
          </button>
        </div>
      </div>

      <div
        v-if="addPanelOpen"
        data-testid="member-search-panel"
        class="rounded-lg bg-white p-4 ring-1 ring-slate-200"
      >
        <p class="text-sm text-slate-600">
          表示名またはメールアドレスで登録済みユーザーを検索します。既存メンバーは結果から除外されます。
        </p>
        <label class="mt-3 block">
          <span class="sr-only">メンバー検索</span>
          <input
            v-model="searchQuery"
            data-testid="member-search-input"
            type="search"
            placeholder="表示名またはメールアドレスで検索"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </label>

        <ErrorAlert v-if="searchError" class="mt-3" :message="searchError" />

        <ul v-if="searchResults.length > 0" class="mt-3 divide-y divide-slate-100" role="list">
          <li
            v-for="candidate in searchResults"
            :key="candidate.userId"
            class="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <div class="min-w-0">
              <p data-testid="search-result-name" class="text-sm font-medium text-slate-900">
                {{ candidate.name }}
              </p>
              <p data-testid="search-result-email" class="text-xs text-slate-600">
                {{ candidate.email }}
              </p>
            </div>
            <button
              type="button"
              data-testid="add-member-button"
              class="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="addingUserId !== null"
              @click="onAddMember(candidate.userId)"
            >
              追加
            </button>
          </li>
        </ul>

        <p
          v-else-if="showSearchEmpty"
          data-testid="member-search-empty"
          class="mt-3 text-sm text-slate-500"
        >
          該当するユーザーがいません。
        </p>
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
                <div class="flex items-center gap-2">
                  <UserAvatar :userId="member.userId" :size="20" />
                  {{ member.name }}
                </div>
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

      <div v-if="showDeleteButton" class="space-y-2 pt-2">
        <p class="text-sm text-slate-600">ワークスペースを削除できるのは作成者のみです。</p>
        <button
          type="button"
          data-testid="workspace-delete-button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          @click="openDeleteConfirm"
        >
          ワークスペースを削除
        </button>
      </div>
    </template>

    <WorkspaceCreateModal :open="createOpen" @close="closeCreate" @created="onCreated" />
    <WorkspaceSettingsModal
      :open="settingsOpen"
      :workspace="currentWorkspace"
      @close="closeSettings"
      @saved="onSettingsSaved"
    />

    <Modal
      :open="deleteConfirmOpen"
      ariaLabel="ワークスペースの削除確認"
      @close="closeDeleteConfirm"
    >
      <template #title>ワークスペースを削除</template>

      <ErrorAlert v-if="deleteError" :message="deleteError" />

      <p class="text-sm text-slate-700">このワークスペースを削除しますか？</p>
      <p class="text-sm text-slate-600">{{ memberCountLabel }}が所属しています。</p>

      <template #actions>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="deleting"
            @click="closeDeleteConfirm"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="workspace-delete-confirm"
            class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="deleting"
            @click="confirmDelete"
          >
            削除する
          </button>
        </div>
      </template>
    </Modal>
  </div>
</template>
