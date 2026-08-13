<!--
  Shared status/tone pill (screen polish pass). Tone classes are a static
  lookup, not a dynamically interpolated Tailwind class string, so the JIT
  scanner can see every class literally and won't purge them.
-->
<script setup lang="ts">
import { computed } from "vue";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "handoff" | "outline";

const props = defineProps<{ tone: Tone; label: string }>();

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  // task-status-model 4.1: 引継待ち専用。緑(success)は完了段階に予約。
  handoff: "bg-[#ccfbf1] text-[#0f766e]",
  // 優先度「中」: 白地+枠のみ。塗りつぶしは優先度「高」と保留に残す。
  outline: "border border-slate-300 bg-white text-slate-600",
};

const classes = computed(() => toneClasses[props.tone]);
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">
    {{ label }}
  </span>
</template>
