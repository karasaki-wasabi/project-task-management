<script setup lang="ts">
import { statusBadgeConfig } from "./StatusBadge.helpers";

const props = defineProps<{ status: TaskStatus }>();
const current = computed(() => statusBadgeConfig(props.status));
</script>

<template>
  <Badge :tone="current.tone" :label="current.label" />
</template>
