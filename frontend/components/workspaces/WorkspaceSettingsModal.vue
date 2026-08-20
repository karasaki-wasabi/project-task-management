<script setup lang="ts">
const props = defineProps<{ open: boolean; workspace: Workspace | null }>();
const emit = defineEmits<{ close: []; saved: [workspace: Workspace] }>();

const api = useApiClient();
const { refresh } = useCurrentWorkspace();

const name = ref("");
const color = ref<WorkspaceColor>(WORKSPACE_COLORS[0]);
const saving = ref(false);
const error = ref<string | null>(null);

function resetForm() {
  const ws = props.workspace;
  name.value = ws?.name ?? "";
  color.value = ws?.color ?? WORKSPACE_COLORS[0];
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

function selectColor(next: WorkspaceColor) {
  color.value = next;
}

async function submit() {
  error.value = null;
  const ws = props.workspace;
  if (ws === null) return;

  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = "ワークスペース名を入力してください";
    return;
  }

  saving.value = true;
  try {
    const updated = await api.updateWorkspace(ws.id, {
      name: trimmed,
      color: color.value,
    });
    await refresh();
    emit("saved", updated);
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
    class="workspace-settings-modal"
    :open="open"
    ariaLabel="ワークスペース設定"
    @close="emit('close')"
  >
    <template #title>ワークスペース設定</template>

    <ErrorAlert v-if="error" :message="error" />

    <form id="workspace-settings-form" class="space-y-4" @submit.prevent="submit">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-500" for="workspace-settings-name">
          ワークスペース名
        </label>
        <input
          id="workspace-settings-name"
          v-model="name"
          required
          :disabled="saving || workspace === null"
          class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <fieldset class="m-0 border-0 p-0">
        <legend class="mb-2 text-xs font-medium text-slate-500">識別色</legend>
        <div class="flex flex-wrap gap-2" role="group" aria-label="識別色">
          <button
            v-for="paletteColor in WORKSPACE_COLORS"
            :key="paletteColor"
            type="button"
            data-testid="workspace-color-swatch"
            :data-color="paletteColor"
            :aria-pressed="color === paletteColor"
            :aria-label="`識別色 ${paletteColor}`"
            :disabled="saving || workspace === null"
            class="h-8 w-8 rounded-full ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            :class="
              color === paletteColor
                ? 'ring-2 ring-slate-900'
                : 'ring-1 ring-slate-300 hover:ring-slate-500'
            "
            :style="{ backgroundColor: paletteColor }"
            @click="selectColor(paletteColor)"
          />
        </div>
      </fieldset>
    </form>

    <template #actions>
      <div class="flex items-center gap-2">
        <button
          type="submit"
          form="workspace-settings-form"
          :disabled="saving || workspace === null"
          class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
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
