<script setup lang="ts">
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
