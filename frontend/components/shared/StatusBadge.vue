<!-- Task status badge (task-status-model 4.1). -->
<script setup lang="ts">
import { computed } from "vue";
import type { TaskStatus } from "../../composables/useApiClient";
import { statusBadgeConfig } from "./StatusBadge.helpers";

const props = defineProps<{ status: TaskStatus }>();

const current = computed(() => statusBadgeConfig(props.status));
</script>

<template>
  <Badge :tone="current.tone" :label="current.label" />
</template>
