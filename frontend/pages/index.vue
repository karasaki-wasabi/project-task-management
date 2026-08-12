<!--
  Landing `/` (workspace-url-routing task 3.1, Requirements 2.1, 2.2, 8.1).
  refresh → last-used valid? navigate to scoped dashboard : show WorkspacePickerPanel.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useCurrentWorkspace } from "../composables/useCurrentWorkspace";
import { workspacePath } from "../utils/workspacePath";
import WorkspacePickerPanel from "../components/workspaces/WorkspacePickerPanel.vue";

const { currentId, refresh } = useCurrentWorkspace();
const showPicker = ref(false);

async function resolveLanding() {
  await refresh();
  if (currentId.value !== null) {
    showPicker.value = false;
    await navigateTo(workspacePath(currentId.value, ""));
    return;
  }
  showPicker.value = true;
}

onMounted(() => {
  void resolveLanding();
});

watch(currentId, (id) => {
  if (id === null) return;
  showPicker.value = false;
  void navigateTo(workspacePath(id, ""));
});
</script>

<template>
  <WorkspacePickerPanel v-if="showPicker" />
</template>
