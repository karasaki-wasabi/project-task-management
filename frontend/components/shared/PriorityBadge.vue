<!-- Task priority badge (screen polish pass). -->
<script setup lang="ts">
import { computed } from "vue";
import type { Priority } from "../../composables/useApiClient";
import Badge from "./Badge.vue";

const props = defineProps<{ priority: Priority }>();

const config: Record<Priority, { tone: "danger" | "outline" | "neutral"; label: string }> = {
  high: { tone: "danger", label: "高" },
  medium: { tone: "outline", label: "中" },
  low: { tone: "neutral", label: "低" },
};

const current = computed(() => config[props.priority]);
</script>

<template>
  <Badge :tone="current.tone" :label="current.label" />
</template>
