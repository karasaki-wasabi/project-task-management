<!--
  Shared status/tone pill (screen polish pass). Tone classes are a static
  lookup, not a dynamically interpolated Tailwind class string, so the JIT
  scanner can see every class literally and won't purge them.
-->
<script setup lang="ts">
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const props = defineProps<{ tone: Tone; label: string }>();

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

const classes = computed(() => toneClasses[props.tone]);
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">
    {{ label }}
  </span>
</template>
