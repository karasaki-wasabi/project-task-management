<!--
  Workspace create modal (task 6.1, design.md WorkspaceCreateModal,
  Requirements 1.1–1.3). Create-only popup with a single name field.
  On success: refresh membership list then select the new workspace as
  current (Requirement 1.3). Reusable from WorkspaceSwitcher (6.2) and
  the /workspaces empty-state CTA (6.3).

  Explicit Vue / composable imports so vitest can mount without Nuxt
  auto-import runtime (same approach as CaseFormModal.vue).
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useApiClient, type Workspace } from "../../composables/useApiClient";
import { useCurrentWorkspace } from "../../composables/useCurrentWorkspace";
import {
  replaceWorkspaceIdInPath,
  workspacePath,
} from "../../utils/workspacePath";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [workspace: Workspace] }>();

const route = useRoute();
const api = useApiClient();
const { refresh, select } = useCurrentWorkspace();

const name = ref("");
const saving = ref(false);
const error = ref<string | null>(null);

function resetForm() {
  name.value = "";
  error.value = null;
  saving.value = false;
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
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = "ワークスペース名を入力してください";
    return;
  }

  saving.value = true;
  try {
    const created = await api.createWorkspace({ name: trimmed });
    await refresh();
    select(created.id);

    const replaced = replaceWorkspaceIdInPath(route.path, created.id);
    if (replaced) {
      await navigateTo({ path: replaced, query: route.query });
    } else {
      await navigateTo(workspacePath(created.id, ""));
    }

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
  <Modal
    class="workspace-create-modal"
    :open="open"
    aria-label="ワークスペースを作成"
    @close="emit('close')"
  >
    <template #title>ワークスペースを作成</template>

    <ErrorAlert v-if="error" :message="error" />

    <form id="workspace-create-form" class="space-y-3" @submit.prevent="submit">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500" for="workspace-create-name">ワークスペース名</label>
        <input
          id="workspace-create-name"
          v-model="name"
          required
          :disabled="saving"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>
      <p class="m-0 text-xs text-slate-500">
        作成したユーザーが自動的に最初のメンバーになります。
      </p>
    </form>

    <template #actions>
      <div class="flex items-center gap-2">
        <button
          type="submit"
          form="workspace-create-form"
          :disabled="saving"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          作成
        </button>
        <button
          type="button"
          :disabled="saving"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          @click="emit('close')"
        >
          キャンセル
        </button>
      </div>
    </template>
  </Modal>
</template>
