<!--
  Shared status/tone pill (screen polish pass). Tone classes are a static
  lookup, not a dynamically interpolated Tailwind class string, so the JIT
  scanner can see every class literally and won't purge them.
-->
<script setup lang="ts">
import { computed } from "vue";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "handoff";

const props = defineProps<{ tone: Tone; label: string }>();

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  // task-status-model 4.1: 引継待ち専用。緑(success)は完了段階に予約。
  handoff: "bg-[#ccfbf1] text-[#0f766e]",
};

const classes = computed(() => toneClasses[props.tone]);
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">
    {{ label }}
  </span>
</template>
