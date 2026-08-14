<script setup lang="ts">
defineProps<{
  options: Array<{ value: string; label: string }>;
  modelValue: string;
  ariaLabel: string;
}>();

const emit = defineEmits<{
  select: [value: string];
}>();
</script>

<template>
  <div
    role="listbox"
    :aria-label="ariaLabel"
    class="max-h-60 overflow-y-auto py-1"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="option"
      :aria-label="option.label"
      :aria-selected="option.value === modelValue"
      class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-primary-50 focus-visible:bg-primary-50 focus-visible:outline-none"
      :class="option.value === modelValue ? 'bg-primary-50 text-primary-800' : ''"
      @click="emit('select', option.value)"
    >
      <slot name="leading" :option="option" />
      <span>{{ option.label }}</span>
      <span
        v-if="option.value === modelValue"
        aria-hidden="true"
        class="shrink-0 text-primary-600"
      >
        ✓
      </span>
    </button>
  </div>
</template>
