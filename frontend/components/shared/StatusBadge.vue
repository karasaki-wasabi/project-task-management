<!-- Task status badge (screen polish pass). -->
<script setup lang="ts">
const props = defineProps<{ status: TaskStatus }>();

const config: Record<TaskStatus, { tone: "neutral" | "info" | "success" | "warning"; label: string }> = {
  not_started: { tone: "neutral", label: "未着手" },
  in_progress: { tone: "info", label: "進行中" },
  done: { tone: "success", label: "完了" },
  on_hold: { tone: "warning", label: "保留" },
};

const current = computed(() => config[props.status]);
</script>

<template>
  <Badge :tone="current.tone" :label="current.label" />
</template>
