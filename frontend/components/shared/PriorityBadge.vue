<!-- Task priority badge (screen polish pass). -->
<script setup lang="ts">
const props = defineProps<{ priority: Priority }>();

const config: Record<Priority, { tone: "danger" | "warning" | "neutral"; label: string }> = {
  high: { tone: "danger", label: "高" },
  medium: { tone: "warning", label: "中" },
  low: { tone: "neutral", label: "低" },
};

const current = computed(() => config[props.priority]);
</script>

<template>
  <Badge :tone="current.tone" :label="current.label" />
</template>
