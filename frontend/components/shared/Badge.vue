<script setup lang="ts">
type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "handoff" | "outline";

const props = defineProps<{ tone: Tone; label: string }>();

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  handoff: "bg-[#ccfbf1] text-[#0f766e]",
  outline: "border border-slate-300 bg-white text-slate-600",
};

const classes = computed(() => toneClasses[props.tone]);
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">
    {{ label }}
  </span>
</template>
